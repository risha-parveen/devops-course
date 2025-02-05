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
    baseURL:  `${HOST}:8197`,
    auth: {
        username: AUTH_USERNAME, 
        password: AUTH_PASSWORD  
    }
}



const api1 = axios.create(config1);

// Helper function to wait between tests
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkServicesAvailable() {
    try {
        await api1.get('/api');
        return true;
    } catch (error) {
        return false;
    }
}

async function runTests() {
    try {
        console.log('Starting API tests for port 8198...\n');

        // Test 1: Access without auth should fail
        console.log('Test 1: Testing unauthorized access to port 8198');
        try {
            await axios.get( `${HOST}:8198`);
            console.log('Test 1 failed: Should not allow unauthorized access');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 1 passed: Unauthorized access properly rejected');
            } else {
                console.log('Test 1 failed with unexpected error:', error.message);
            }
        }
        console.log(AUTH_USERNAME)

        // Test 2: Access main API endpoint with auth
        console.log('\nTest 2: Testing authorized access to main API');
        try {
            const response = await api1.get('api');
            
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

        console.log('\nTest 5: Testing shutdown functionality in port 8198');
        try {
            // First verify services are available
            const servicesAvailable = await checkServicesAvailable();
            if (!servicesAvailable) {
                throw new Error('Services are not available before shutdown test');
            }
            console.log('Services are available before shutdown');

            // Send shutdown command
            console.log('Sending shutdown command...');
            const response = await api1.post('/shutdown');
            console.log('Shutdown response:', response.data);

            // Wait for services to stop (adjust timeout as needed)
            console.log('Waiting for services to stop...');
            await wait(5000);

            // Try to access services after shutdown
            let retries = 3;
            let servicesDown = false;
            
            while (retries > 0) {
                const available = await checkServicesAvailable();
                if (!available) {
                    servicesDown = true;
                    break;
                }
                console.log(`Services still responding, waiting... (${retries} retries left)`);
                await wait(2000);
                retries--;
            }

            if (servicesDown) {
                console.log('Test 5 passed: Services have been shut down successfully');
                 // Add this line to ensure clean exit
                console.log('All tests completed successfully! Shutdown command sent.');
                process.exit(0); 
            } else {
                console.log('Test 5 failed: Services are still responding after shutdown');
            }
        } catch (error) {
            console.log('Test 5 failed with error:', error.message);
            if (error.response) {
                console.log('Error response:', error.response.data);
            }
        }

    } catch (error) {
        
    }
}

// Run the tests
runTests().catch(console.error);