const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const port = 8199;

// Function to get system information
async function getSystemInfo() {
    try {
        // ip address
        const networkInterfaces = os.networkInterfaces();
        const ipAddress = Object.values(networkInterfaces)
            .flat()
            .filter(interface => !interface.internal && interface.family === 'IPv4')
            .map(interface => interface.address)[0];

        // process list
        const { stdout: processes } = await execPromise('ps -ax');

        // disk space
        const { stdout: diskSpace } = await execPromise('df -h');

        // uptime
        const uptime = os.uptime();

        return {
            ipAddress,
            processes: processes,
            diskSpace: diskSpace,
            uptimeSeconds: uptime
        };
    } catch (error) {
        throw error;
    }
}

app.get('/', async (req, res) => {
    try {
        const infoService1 = await getSystemInfo();
        // for networking with service2 in docker containers
        const service2BaseURL = process.env.SERVICE2_BASE_URL || 'http://localhost:8200';
        const service2Response = await axios.get(`${service2BaseURL}/`);
        // const service2Response = await axios.get('http://localhost:8200/');
        const infoService2 = service2Response.data;
        
        const response = {
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
                'time since last boot2': `${infoService2.uptimeSeconds} seconds`
            }
        };

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Service1 listening at ${port}`);
});
