const axios = require('axios'); // Import Axios for making HTTP requests
require('dotenv').config(); // Load environment variables from a .env file

// Authentication credentials, checking both CI/CD and local environment variables
const AUTH_USERNAME = process.env.NGINX_USER || process.env.LOCAL_USERNAME;
const AUTH_PASSWORD = process.env.NGINX_PASS || process.env.LOCAL_PASSWORD;

// Detect if running inside a Docker container (default to 1 if not set)
const IS_DOCKER = process.env.IS_DOCKER || 1;

// Determine the correct hostname based on environment (Docker or local)
const HOST = IS_DOCKER ? 'http://nginx' : 'http://localhost';

// Axios configuration for API on port 8198 (authenticated requests)
const config1 = {
    baseURL:  `${HOST}:8198`,
    auth: {
        username: AUTH_USERNAME, 
        password: AUTH_PASSWORD  
    }
};

// Axios configuration for API on port 8197 (non-authenticated requests)
const config2 = {
    baseURL: `${HOST}:8197`,
    headers: {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain'
    }
}

// Authenticated requests for port 8197 (state changes require authentication)
const authConfig = {
    ...config2,
    auth: {
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD
    }
};

// Create Axios instances for easier API calls
const api1 = axios.create(config1);
const api2 = axios.create(config2);
const authApi = axios.create(authConfig);

// Helper function to introduce delays between tests
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs tests to verify state transitions and API behavior.
 */
async function runStateTests() {
    try {
        console.log('Starting state management tests...\n');

        // Test 1: Get initial system state
        console.log('Test 1: Getting initial state');
        try {
            const response = await api2.get('/state');
            if (response.data === 'INIT') {
                console.log('Test 1 passed ✅: System starts in INIT state');
            } else {
                console.log(`Test 1 failed ❌: Expected INIT state, got ${response.data}`);
            }
        } catch (error) {
            console.log('Test 1 failed ❌:', error.message);
        }

        // Test 2: Attempt to change state without authentication
        console.log('\nTest 2: Testing state change without authentication');
        try {
            await api2.put('/state', 'RUNNING'); // This should fail
            console.log('Test 2 failed ❌: Should not allow state change without authentication');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Test 2 passed ✅: Unauthorized state change properly rejected');
            } else {
                console.log('Test 2 failed ❌ with unexpected error:', error.message);
            }
        }

        // Test 3: Change state from INIT -> RUNNING with authentication
        console.log('\nTest 3: Testing valid state transition (INIT -> RUNNING)');
        try {
            const response = await authApi.put('/state', 'RUNNING');
            if (response.status !== 200) {
                throw new Error(`Failed to change state: ${response.data}`);
            }
            await wait(5000); // Wait for state to change
            const newState = await api2.get('/state');
            if (newState.data === 'RUNNING') {
                console.log('Test 3 passed ✅: State successfully changed to RUNNING');
            } else {
                console.log(`Test 3 failed ❌: Expected RUNNING state, got ${newState.data}`);
            }
        } catch (error) {
            console.log('Test 3 failed ❌:', error.message);
        }

        // Test 4: Attempt to set an invalid state
        console.log('\nTest 4: Testing invalid state transition');
        try {
            await authApi.put('/state', 'INVALID_STATE'); // This should fail
            console.log('Test 4 failed ❌: Should not accept invalid state');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log('Test 4 passed ✅: Invalid state properly rejected');
            } else {
                console.log('Test 4 failed ❌ with unexpected error:', error.message);
            }
        }

        // Test 5: Verify PAUSED state behavior
        console.log('\nTest 5: Testing PAUSED state behavior');
        try {
            await authApi.put('/state', 'PAUSED'); // Set state to PAUSED
            await wait(2000);
            const stateResponse = await api2.get('/state');
            if (stateResponse.data !== 'PAUSED') {
                throw new Error('Failed to set PAUSED state');
            }

            // Try making a request while PAUSED (should fail)
            try {
                await api2.get('/request');
                console.log('Test 5 failed ❌: System should not respond while PAUSED');
            } catch (error) {
                if (error.response && error.response.status === 503) {
                    console.log('Test 5 passed ✅: System correctly rejects requests while PAUSED');
                } else {
                    console.log('Test 5 failed ❌ with unexpected error:', error.message);
                }
            }
        } catch (error) {
            console.log('Test 5 failed ❌:', error.message);
        }

        // Test 6: Check run-log functionality
        console.log('\nTest 6: Testing run-log functionality');
        try {
            const logResponse = await api2.get('/run-log');
            console.log(logResponse.data);
            if (logResponse.data.includes('INIT -> RUNNING') && logResponse.data.includes('RUNNING -> PAUSED')) {
                console.log('Test 6 passed ✅: State transitions properly logged');
            } else {
                console.log('Test 6 failed ❌: Expected transitions not found in logs');
            }
        } catch (error) {
            console.log('Test 6 failed ❌:', error.message);
        }

        // Test 7: Verify SHUTDOWN state behavior
        console.log('\nTest 7: Testing SHUTDOWN state');
        try {
            await authApi.put('/state', 'SHUTDOWN'); // Initiate shutdown
            await wait(10000); // Wait for shutdown process
            
            // System should no longer respond
            try {
                await api2.get('/state');
                console.log('Test 7 failed ❌: System should be shut down');
            } catch (error) {
                if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                    console.log('Test 7 passed ✅: System successfully shut down');
                } else {
                    console.log('Test 7 failed ❌ with unexpected error:', error.message);
                }
            }
        } catch (error) {
            console.log('Test 7 failed ❌:', error.message);
        }

    } catch (error) {
        console.error('Test suite failed ❌:', error.message);
    }
}

/**
 * Runs API tests for port 8198.
 */
async function runTests() {
    try {
        console.log('Starting API tests for port 8198...\n');

        // Test: Verify API returns valid response
        console.log('\nTest 1: Testing authorized access to main API');
        try {
            const response = await api1.get('request');
            if (response.data && response.data.Service1 && response.data.Service2) {
                console.log('Test 1 passed ✅: Received valid response');
            } else {
                console.log('Test 1 failed ❌: Invalid response structure');
            }
        } catch (error) {
            console.log('Test 1 failed ❌:', error.message);
        }

        // Test: Unauthorized access to port 8197 should be allowed
        console.log('Test 2: Testing unauthorized access to port 8197');
        try {
            await axios.get(`${HOST}:8197`);
            console.log('Test 2 passed ✅: Port allows unauthorized access');
        } catch (error) {
            console.log('Test 2 failed ❌ with unexpected error:', error.message);
        }

        // Run state tests
        runStateTests().catch(console.error);
    } catch (error) {
        console.error('API test suite failed ❌:', error.message);
    }
}

// Start the test suite
runTests().catch(console.error);
