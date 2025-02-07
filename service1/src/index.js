const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const Docker = require('dockerode');
const axios = require('axios');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();

const app = express();
const port = 8199;

// Middleware
app.use(express.text());

// State Management
const State = {
    INIT: 'INIT',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    SHUTDOWN: 'SHUTDOWN'
};

const validTransitions = {
    [State.INIT]: [State.RUNNING],
    [State.RUNNING]: [State.PAUSED, State.SHUTDOWN, State.INIT],
    [State.PAUSED]: [State.RUNNING, State.INIT, State.SHUTDOWN]
};

let currentState = State.INIT;
const stateLog = [];

// Authentication check middleware
function authMiddleware(req, res, next) {
    // If system is in INIT state, require authentication for all endpoints except GET /state and GET /run-log
    if (currentState === State.INIT && 
        !(req.method === 'GET' && (req.path === '/state' || req.path === '/run-log'))) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return res.status(401).send('Authentication required when system is in INIT state');
        }

        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        if (username !== 'rishaparveen' || password !== 'password123') {
            return res.status(401).send('Invalid credentials');
        }
    }
    next();
}

app.use(authMiddleware);

// State logging
function logStateChange(fromState, toState) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}: ${fromState}->${toState}`;
    stateLog.push(logEntry);
    console.log(`State transition: ${logEntry}`);
}

// System information helper
async function getSystemInfo() {
    try {
        const networkInterfaces = os.networkInterfaces();
        const ipAddress = Object.values(networkInterfaces)
            .flat()
            .filter(interface => !interface.internal && interface.family === 'IPv4')
            .map(interface => interface.address)[0];

        const { stdout: processes } = await execPromise('ps -ax');
        const { stdout: diskSpace } = await execPromise('df -h');
        const uptime = os.uptime();

        return { ipAddress, processes, diskSpace, uptimeSeconds: uptime };
    } catch (error) {
        throw error;
    }
}

// Endpoints
app.get('/run-log', (req, res) => {
    res.type('text/plain').send(stateLog.join('\n') || 'No state changes logged yet');
});

app.get('/state', (req, res) => {
    res.type('text/plain').send(currentState);
});

app.put('/state', (req, res) => {
    const newState = req.body.trim().toUpperCase();
    
    // Validate state
    if (!Object.values(State).includes(newState)) {
        return res.status(400).send(`Invalid state. Valid states are: ${Object.values(State).join(', ')}`);
    }

    // Validate transition
    if (!validTransitions[currentState].includes(newState)) {
        return res.status(400).send(`Invalid state transition from ${currentState} to ${newState}`);
    }

    const previousState = currentState;
    currentState = newState;
    logStateChange(previousState, newState);

    // Handle special states
    if (newState === State.SHUTDOWN) {
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
        docker.listContainers({ all: true }, (err, containers) => {
            if (err) {
                console.error('Error listing containers:', err);
                return;
            }
            containers.forEach((containerInfo) => {
                const container = docker.getContainer(containerInfo.Id);
                container.stop((stopErr) => {
                    if (stopErr) console.error(`Error stopping container ${containerInfo.Id}:`, stopErr);
                });
            });
        });
    }

    res.status(200).send(`State changed to ${newState}`);
});

app.get('/request', async (req, res) => {
    // Check if system is in a state that allows requests
    if (currentState === State.PAUSED) {
        return res.status(503).type('text/plain').send('System is paused');
    }

    try {
        const infoService1 = await getSystemInfo();
        const service2BaseURL = process.env.SERVICE2_BASE_URL || 'http://localhost:8200';
        const service2Response = await axios.get(`${service2BaseURL}/`);
        const infoService2 = service2Response.data;

        // Check if request is from API gateway or UI
        if (req.get('Content-Type') === 'text/plain') {
            // API Gateway response (text/plain)
            res.type('text/plain').send(
`Service1:
IP address information: ${infoService1.ipAddress}
List of running processes:
${infoService1.processes}
Available disk space:
${infoService1.diskSpace}
Time since last boot: ${infoService1.uptimeSeconds} seconds

Service2:
IP address information: ${infoService2.ipAddress}
List of running processes:
${infoService2.processes}
Available disk space:
${infoService2.diskSpace}
Time since last boot: ${infoService2.uptimeSeconds} seconds`
            );
        } else {
            // UI response (JSON)
            res.json({
                Service1: {
                    'IP address information': infoService1.ipAddress,
                    'list of running processes': infoService1.processes,
                    'available disk space': infoService1.diskSpace,
                    'time since last boot': `${infoService1.uptimeSeconds} seconds`
                },
                Service2: {
                    'IP address information': infoService2.ipAddress,
                    'list of running processes': infoService2.processes,
                    'available disk space': infoService2.diskSpace,
                    'time since last boot': `${infoService2.uptimeSeconds} seconds`
                }
            });
        }
    } catch (error) {
        const errorMsg = 'Internal server error';
        if (req.get('Content-Type') === 'text/plain') {
            res.status(500).type('text/plain').send(errorMsg);
        } else {
            res.status(500).json({ error: errorMsg });
        }
    }
});

app.post('/shutdown', (req, res) => {

    // Handle docker container shutdown
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    docker.listContainers({ all: true }, (err, containers) => {
        if (err) {
            console.error('Error listing containers:', err);
            return res.status(500).json({ error: 'Failed to shutdown containers' });
        }
        containers.forEach((containerInfo) => {
            const container = docker.getContainer(containerInfo.Id);
            container.stop((stopErr) => {
                if (stopErr) console.error(`Error stopping container ${containerInfo.Id}:`, stopErr);
            });
        });
    });

    res.status(200).json({ message: 'Shutdown initiated' });
});

// Start server
app.listen(port, () => {
    console.log(`Service1 listening at ${port}`);
    logStateChange('STARTUP', State.INIT);
});