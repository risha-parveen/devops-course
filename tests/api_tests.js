const axios = require('axios');
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
require('dotenv').config()

const AUTH_USERNAME = process.env.NGINX_USER || process.env.LOCAL_USERNAME;
const AUTH_PASSWORD = process.env.NGINX_PASS || process.env.LOCAL_PASSWORD;

// Configuration
const config = {
    baseURL: 'http://localhost:8198',
    auth: {
        username: AUTH_USERNAME, 
        password: AUTH_PASSWORD  
    }
};

const api = axios.create(config);

// Helper function to wait between tests
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkServicesAvailable() {
    try {
        await api.get('/api', config);
        return true;
    } catch (error) {
        return false;
    }
}

async function runTests() {
    try {
        console.log('Starting API tests...\n');

        // Test 1: Access without auth should fail
        console.log('Test 1: Testing unauthorized access');
        try {
            await axios.get('http://localhost:8198/');
            console.log('Test 1 failed: Should not allow unauthorized access');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 1 passed: Unauthorized access properly rejected');
            } else {
                console.log('Test 1 failed with unexpected error:', error.message);
            }
        }

        // Test 2: Access main API endpoint with auth
        console.log('\nTest 2: Testing authorized access to main API');
        try {
            const response = await axios.get('api', config);
            
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

        console.log('\nTest 4: Testing shutdown functionality');
        try {
            // First verify services are available
            const servicesAvailable = await checkServicesAvailable();
            if (!servicesAvailable) {
                throw new Error('Services are not available before shutdown test');
            }
            console.log('Services are available before shutdown');

            // Send shutdown command
            console.log('Sending shutdown command...');
            const response = await api.post('/shutdown');
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
                console.log('Test 3 passed: Services have been shut down successfully');
            } else {
                console.log('Test 3 failed: Services are still responding after shutdown');
            }
        } catch (error) {
            console.log('Test 3 failed with error:', error.message);
            if (error.response) {
                console.log('Error response:', error.response.data);
            }
        }

        console.log('\nAll tests completed!');

    } catch (error) {
        
    }
}

// Run the tests
runTests().catch(console.error);