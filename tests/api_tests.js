const axios = require('axios');
require('dotenv').config()

const AUTH_USERNAME = process.env.NGINX_USER || process.env.LOCAL_USERNAME;
const AUTH_PASSWORD = process.env.NGINX_PASS || process.env.LOCAL_PASSWORD;
// Detect if running inside Docker
const IS_DOCKER = process.env.IS_DOCKER || 1;

// Use correct hostnames
const HOST = IS_DOCKER ? 'http://nginx' : 'http://localhost';

// Configuration
const config1 = {
    baseURL:  `${HOST}:8198`,
    auth: {
        username: AUTH_USERNAME, 
        password: AUTH_PASSWORD  
    }
};

const config2 = {
    baseURL: `${HOST}:8197`,
    headers: {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain'
    }
}

const authConfig = {
    ...config2,
    auth: {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD
    }
};

const api1 = axios.create(config1);

const api2 = axios.create(config2)
const authApi = axios.create(authConfig);

// Helper function to wait between tests
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runStateTests() {
    try {
        console.log('Starting state management tests...\n');

        // Test 1: Get initial state
        console.log('Test 1: Getting initial state');
        try {
            const response = await api2.get('/state');
            if (response.data === 'INIT') {
                console.log('Test 1 passed: System starts in INIT state');
            } else {
                console.log(`Test 1 failed: Expected INIT state, got ${response.data}`);
            }
        } catch (error) {
            console.log('Test 1 failed:', error.message);
        }

        // Test 2: Attempt state change without authentication
        console.log('\nTest 2: Testing state change without authentication');
        try {
            await api2.put('/state', 'RUNNING');
            console.log('Test 2 failed: Should not allow state change without authentication');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 2 passed: Unauthorized state change properly rejected');
            } else {
                console.log('Test 2 failed with unexpected error:', error.message);
            }
        }

        console.log('\nTest 3: Testing valid state transition (INIT -> RUNNING)');
        try {
            const response = await authApi.put('/state', 'RUNNING');
            if (response.status !== 200) {
                throw new Error(`Failed to change state: ${response.data}`);
            }
            await wait(5000); // Add 1 second delay
            const newState = await api2.get('/state');
            if (newState.data === 'RUNNING') {
                console.log('Test 3 passed: State successfully changed to RUNNING');
            } else {
                console.log(`Test 3 failed: Expected RUNNING state, got ${newState.data}`);
            }
        } catch (error) {
            console.log('Test 3 failed:', error.message);
        }

        // Test 4: Invalid state transition
        console.log('\nTest 4: Testing invalid state transition');
        try {
            const curr = await api2.get('/state')
            await authApi.put('/state', 'INVALID_STATE');
            console.log('Test 4 failed: Should not accept invalid state');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log('Test 4 passed: Invalid state properly rejected');
            } else {
                console.log('Test 4 failed with unexpected error:', error.message);
            }
        }

        // Test 5: PAUSED state behavior
        console.log('\nTest 5: Testing PAUSED state behavior');
        try {
            await authApi.put('/state', 'PAUSED');
            await wait(2000)
            const stateResponse = await api2.get('/state');
            if (stateResponse.data !== 'PAUSED') {
                throw new Error('Failed to set PAUSED state');
            }

            // Try to make a request while paused
            try {
                await api2.get('/request');
                console.log('Test 5 failed: System should not respond to requests while PAUSED');
            } catch (error) {
                if (error.response && error.response.status === 503) {
                    console.log('Test 5 passed: System correctly refuses requests while PAUSED');
                } else {
                    console.log('Test 5 failed with unexpected error:', error.message);
                }
            }
        } catch (error) {
            console.log('Test 5 failed:', error.message);
        }

        // Test 6: Test run-log
        console.log('\nTest 6: Testing run-log functionality');
        try {
            const logResponse = await api2.get('/run-log');
            const logs = logResponse.data;
            console.log(logs)
            if (logs.includes('INIT -> RUNNING') && logs.includes('RUNNING -> PAUSED')) {
                console.log('Test 6 passed: State transitions properly logged');
            } else {
                console.log('Test 6 failed: Expected state transitions not found in logs');
            }
        } catch (error) {
            console.log('Test 6 failed:', error.message);
        }

        // Test 7: SHUTDOWN state
        console.log('\nTest 7: Testing SHUTDOWN state');
        try {
            await authApi.put('/state', 'SHUTDOWN');
            await wait(10000); // Wait for shutdown to take effect
            
            try {
                await api2.get('/state');
                console.log('Test 7 failed: System should be shut down');
            } catch (error) {
                if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                    console.log('Test 7 passed: System successfully shut down');
                } else {
                    console.log('Test 7 failed with unexpected error:', error.message);
                }
            }
        } catch (error) {
            console.log('Test 7 failed:', error.message);
        }

    } catch (error) {
        console.error('Test suite failed:', error.message);
    }
}

async function runTests() {
    try {
        console.log('Starting API tests for port 8198...\n');

        // Test 2: Access main API endpoint with auth
        console.log('\nTest 2: Testing authorized access to main API');
        try {
            const response = await api1.get('request');
            
            const hasService1Data = response.data && response.data.Service1;
            const hasService2Data = response.data && response.data.Service2;
            
            if (hasService1Data && hasService2Data) {
                console.log('Test 2 passed: Received valid response from both services');
            } else {
                console.log('Test 2 failed: Invalid response structure');
            }
        } catch (error) {
            console.log('Test 2 failed:', error.message);
        }


        // Test 3: Access without auth should not fail for port 8197
        console.log('Test 3: Testing unauthorized access to port 8197');
        try {
            await axios.get( `${HOST}:8197`);
            console.log('Test 3 passed: Port allows unauthorized access');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 3 failed: Unauthorized access rejected');
            } else {
                console.log('Test 3 failed with unexpected error:', error.message);
            }
        }

        console.log('Test 4: Testing run_log functionality');
        try {
            const response = await axios.get( `${HOST}:8197/run-log`);
            if (response.data)
                console.log('Test 4 passed: logs are returned');
            else console.log('Test 4 failed: logs are empty')
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 4 failed: Unauthorized access rejected');
            } else {
                console.log('Test 4 failed with unexpected error:', error.message);
            }
        }

        runStateTests().catch(console.error);

        // console.log('\nTest 5: Testing shutdown functionality in port 8198');
        // try {
        //     // First verify services are available
        //     const servicesAvailable = await checkServicesAvailable();
        //     if (!servicesAvailable) {
        //         throw new Error('Services are not available before shutdown test');
        //     }
        //     console.log('Services are available before shutdown');

        //     // Send shutdown command
        //     console.log('Sending shutdown command...');
        //     const response = await api1.post('/shutdown');
        //     console.log('Shutdown response:', response.data);

        //     // Wait for services to stop (adjust timeout as needed)
        //     console.log('Waiting for services to stop...');
        //     await wait(5000);

        //     // Try to access services after shutdown
        //     let retries = 3;
        //     let servicesDown = false;
            
        //     while (retries > 0) {
        //         const available = await checkServicesAvailable();
        //         if (!available) {
        //             servicesDown = true;
        //             break;
        //         }
        //         console.log(`Services still responding, waiting... (${retries} retries left)`);
        //         await wait(2000);
        //         retries--;
        //     }

        //     if (servicesDown) {
        //         console.log('Test 5 passed: Services have been shut down successfully');
        //          // Add this line to ensure clean exit
        //         console.log('All tests completed successfully! Shutdown command sent.');
        //         process.exit(0); 
        //     } else {
        //         console.log('Test 5 failed: Services are still responding after shutdown');
        //     }
        // } catch (error) {
        //     console.log('Test 5 failed with error:', error.message);
        //     if (error.response) {
        //         console.log('Error response:', error.response.data);
        //     }
        // }

    } catch (error) {
        
    }
}

// Run the tests
runTests().catch(console.error);
