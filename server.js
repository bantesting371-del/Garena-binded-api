// ============================================
// GARENA ACCOUNT BIND API
// Production Ready - Complete Code
// ============================================

const express = require('express');
const axios = require('axios');
const cors = require('cors');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// MIDDLEWARE SETUP
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================
// GARENA API CONFIGURATION
// ============================================
const GARENA_CONFIG = {
    BASE_URL: 'https://ffmconnect.live.gop.garenanow.com',
    APP_ID: '100067',
    USER_AGENT: 'GarenaMSDK/4.0.41(25057PC09I ;Android 15;en;IN;app 1.123.1 2019120270;)',
    DEFAULT_LOCALE: 'en_IN',
    TIMEOUT: 20000,
    HEADERS: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': 'gzip',
        'Connection': 'Keep-Alive'
    }
};

// ============================================
// HELPER FUNCTION: Call Garena API
// ============================================
async function callGarenaAPI(endpoint, params) {
    try {
        // Build request data
        const formData = new URLSearchParams();
        formData.append('app_id', GARENA_CONFIG.APP_ID);
        
        // Add all params dynamically
        Object.keys(params).forEach(key => {
            formData.append(key, params[key]);
        });

        // Make request
        const response = await axios({
            method: 'POST',
            url: `${GARENA_CONFIG.BASE_URL}${endpoint}`,
            data: formData.toString(),
            headers: {
                ...GARENA_CONFIG.HEADERS,
                'User-Agent': GARENA_CONFIG.USER_AGENT
            },
            timeout: GARENA_CONFIG.TIMEOUT,
            validateStatus: function (status) {
                return status >= 200 && status < 600; // Accept all responses
            }
        });

        return {
            success: true,
            statusCode: response.status,
            data: response.data
        };
    } catch (error) {
        // Handle network errors
        if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout - Garena API took too long');
        }
        if (error.code === 'ENOTFOUND') {
            throw new Error('Garena API host not found');
        }
        throw new Error(`Garena API Error: ${error.message}`);
    }
}

// ============================================
// API ENDPOINT 1: Send OTP
// ============================================
app.post('/api/send-otp', async (req, res) => {
    try {
        const { access_token, email } = req.body;

        // Validate inputs
        if (!access_token || !email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                required: {
                    access_token: 'Your Garena access token',
                    email: 'Target email address'
                }
            });
        }

        // Validate email format
        if (!email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        console.log(`📧 Sending OTP to: ${email}`);

        // Call Garena Send OTP endpoint
        const result = await callGarenaAPI('/game/account_security/bind:send_otp', {
            access_token: access_token,
            email: email,
            locale: GARENA_CONFIG.DEFAULT_LOCALE
        });

        // Check Garena response
        if (result.data.result !== undefined && result.data.result !== 0) {
            return res.status(400).json({
                success: false,
                error: 'Garena rejected the request',
                garena_response: result.data
            });
        }

        // Success response
        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully. Check email for verification code.',
            step: 'otp_sent',
            next_action: 'Send OTP code to /api/verify-otp endpoint',
            data: result.data
        });

    } catch (error) {
        console.error('Send OTP Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to send OTP',
            details: error.message
        });
    }
});

// ============================================
// API ENDPOINT 2: Verify OTP
// ============================================
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { access_token, email, otp } = req.body;

        // Validate inputs
        if (!access_token || !email || !otp) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                required: {
                    access_token: 'Your Garena access token',
                    email: 'Email used for OTP',
                    otp: 'OTP code received on email'
                }
            });
        }

        // Validate OTP format (should be 8 digits)
        if (!/^\d{8}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid OTP format. Should be 8 digits.'
            });
        }

        console.log(`🔐 Verifying OTP for: ${email}`);

        // Call Garena Verify OTP endpoint
        const result = await callGarenaAPI('/game/account_security/bind:verify_identity', {
            access_token: access_token,
            email: email,
            otp: otp
        });

        // Extract identity token
        const identity_token = result.data?.identity_token;

        if (!identity_token) {
            return res.status(400).json({
                success: false,
                error: 'OTP verification failed. Invalid OTP or expired.',
                garena_response: result.data
            });
        }

        // Success response
        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            step: 'otp_verified',
            identity_token: identity_token,
            next_action: 'Use this identity_token with verifier_token at /api/create-rebind',
            data: result.data
        });

    } catch (error) {
        console.error('Verify OTP Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify OTP',
            details: error.message
        });
    }
});

// ============================================
// API ENDPOINT 3: Create Rebind Request
// ============================================
app.post('/api/create-rebind', async (req, res) => {
    try {
        const { access_token, email, identity_token, verifier_token } = req.body;

        // Validate inputs
        if (!access_token || !email || !identity_token || !verifier_token) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                required: {
                    access_token: 'Your Garena access token',
                    email: 'Email used in previous steps',
                    identity_token: 'Token from verify-otp response',
                    verifier_token: 'Verifier token from game client'
                }
            });
        }

        console.log(`🔗 Creating rebind request for: ${email}`);

        // Call Garena Create Rebind endpoint
        const result = await callGarenaAPI('/game/account_security/bind:create_rebind_request', {
            access_token: access_token,
            email: email,
            identity_token: identity_token,
            verifier_token: verifier_token
        });

        // Check if successful
        if (result.data.result !== undefined && result.data.result !== 0) {
            return res.status(400).json({
                success: false,
                error: 'Garena rejected rebind request',
                garena_response: result.data
            });
        }

        // Success response
        return res.status(200).json({
            success: true,
            message: 'Rebind request created successfully. Complete binding in game client.',
            step: 'rebind_created',
            next_action: 'Open game client to complete final binding step',
            data: result.data
        });

    } catch (error) {
        console.error('Create Rebind Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to create rebind request',
            details: error.message
        });
    }
});

// ============================================
// API ENDPOINT 4: SMART AUTO-FLOW
// Auto-detects step based on provided data
// ============================================
app.post('/api/bind', async (req, res) => {
    try {
        const { access_token, email, otp, verifier_token } = req.body;

        // Basic validation
        if (!access_token || !email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                required: 'access_token and email are always required',
                optional: 'otp, verifier_token (based on step)'
            });
        }

        console.log(`🔄 Smart flow for: ${email}`);

        // STEP 1: If no OTP, send OTP
        if (!otp) {
            console.log('→ Step 1: Sending OTP');
            
            const result = await callGarenaAPI('/game/account_security/bind:send_otp', {
                access_token,
                email,
                locale: GARENA_CONFIG.DEFAULT_LOCALE
            });

            return res.status(200).json({
                success: true,
                current_step: 'otp_sent',
                message: 'OTP has been sent to your email',
                next_step: 'Send OTP code to continue',
                instruction: 'Include "otp" field in next request',
                data: result.data
            });
        }

        // STEP 2: OTP provided, verify it
        console.log('→ Step 2: Verifying OTP');
        
        const verifyResult = await callGarenaAPI('/game/account_security/bind:verify_identity', {
            access_token,
            email,
            otp
        });

        const identity_token = verifyResult.data?.identity_token;

        if (!identity_token) {
            return res.status(400).json({
                success: false,
                current_step: 'otp_verification_failed',
                error: 'Invalid OTP or verification failed',
                data: verifyResult.data
            });
        }

        // STEP 3: If verifier_token provided, do rebind too
        if (verifier_token) {
            console.log('→ Step 3: Creating rebind request');
            
            const rebindResult = await callGarenaAPI('/game/account_security/bind:create_rebind_request', {
                access_token,
                email,
                identity_token,
                verifier_token
            });

            return res.status(200).json({
                success: true,
                current_step: 'complete',
                message: 'All steps completed! Use game client for final binding.',
                identity_token: identity_token,
                rebind_result: rebindResult.data
            });
        }

        // Only OTP verified, waiting for verifier_token
        return res.status(200).json({
            success: true,
            current_step: 'otp_verified',
            message: 'OTP verified successfully',
            identity_token: identity_token,
            next_step: 'Provide verifier_token to complete binding',
            instruction: 'Include "verifier_token" field in next request'
        });

    } catch (error) {
        console.error('Smart Flow Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// ============================================
// HEALTH CHECK & INFO ENDPOINT
// ============================================
app.get('/', (req, res) => {
    return res.status(200).json({
        status: '🟢 Online & Operational',
        service: 'Garena Account Bind API',
        version: '1.0.0',
        server_time: new Date().toISOString(),
        uptime: process.uptime(),
        endpoints: {
            health_check: {
                method: 'GET',
                path: '/'
            },
            smart_flow: {
                method: 'POST',
                path: '/api/bind',
                description: 'Auto-detects step. Send access_token & email. Then OTP. Then verifier_token.'
            },
            send_otp: {
                method: 'POST',
                path: '/api/send-otp',
                body: { access_token: 'string', email: 'string' }
            },
            verify_otp: {
                method: 'POST',
                path: '/api/verify-otp',
                body: { access_token: 'string', email: 'string', otp: 'string(8 digits)' }
            },
            create_rebind: {
                method: 'POST',
                path: '/api/create-rebind',
                body: { access_token: 'string', email: 'string', identity_token: 'string', verifier_token: 'string' }
            }
        },
        usage_flow: {
            step_1: 'POST /api/bind with {access_token, email} → Get OTP on email',
            step_2: 'POST /api/bind with {access_token, email, otp} → Get identity_token',
            step_3: 'POST /api/bind with {access_token, email, otp, verifier_token} → Complete rebind'
        }
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        available_endpoints: [
            'GET /',
            'POST /api/bind',
            'POST /api/send-otp',
            'POST /api/verify-otp',
            'POST /api/create-rebind'
        ]
    });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message || 'Something went wrong'
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║                                              ║');
    console.log('║   🚀 GARENA ACCOUNT BIND API                ║');
    console.log('║   ✅ Server Started Successfully            ║');
    console.log(`║   📍 Port: ${PORT}                            ║`);
    console.log(`║   🌐 Local: http://localhost:${PORT}          ║');
    console.log('║                                              ║');
    console.log('║   📋 ENDPOINTS:                             ║');
    console.log('║   GET  /                - Health Check      ║');
    console.log('║   POST /api/bind        - Smart Auto-Flow   ║');
    console.log('║   POST /api/send-otp    - Send OTP          ║');
    console.log('║   POST /api/verify-otp  - Verify OTP        ║');
    console.log('║   POST /api/create-rebind - Create Rebind   ║');
    console.log('║                                              ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
});
