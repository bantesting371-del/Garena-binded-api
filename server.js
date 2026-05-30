const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BASE_URL = 'https://ffmconnect.live.gop.garenanow.com';
const APP_ID = '100067';
const USER_AGENT = 'GarenaMSDK/4.0.41(25057PC09I ;Android 15;en;IN;app 1.123.1 2019120270;)';

// Helper function
async function callGarena(endpoint, params) {
    try {
        const formData = new URLSearchParams();
        formData.append('app_id', APP_ID);
        for (const key in params) {
            formData.append(key, params[key]);
        }
        
        const response = await axios.post(`${BASE_URL}${endpoint}`, formData.toString(), {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });
        
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Health Check
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'Garena Bind API',
        endpoints: {
            bind: 'POST /api/bind',
            send_otp: 'POST /api/send-otp',
            verify_otp: 'POST /api/verify-otp',
            create_rebind: 'POST /api/create-rebind'
        }
    });
});

// Smart Auto-Flow Endpoint
app.post('/api/bind', async (req, res) => {
    try {
        const { access_token, email, otp, verifier_token } = req.body;

        if (!access_token || !email) {
            return res.status(400).json({
                success: false,
                error: 'access_token and email are required'
            });
        }

        // Step 1: Send OTP
        if (!otp) {
            const result = await callGarena('/game/account_security/bind:send_otp', {
                access_token,
                email,
                locale: 'en_IN'
            });

            if (!result.success) {
                return res.status(500).json({ success: false, error: result.error });
            }

            return res.json({
                success: true,
                step: 'otp_sent',
                message: 'OTP sent. Check email and provide OTP.',
                data: result.data
            });
        }

        // Step 2: Verify OTP
        const verifyResult = await callGarena('/game/account_security/bind:verify_identity', {
            access_token,
            email,
            otp
        });

        if (!verifyResult.success) {
            return res.status(500).json({ success: false, error: verifyResult.error });
        }

        const identity_token = verifyResult.data.identity_token;

        if (!identity_token) {
            return res.status(400).json({
                success: false,
                error: 'OTP verification failed',
                data: verifyResult.data
            });
        }

        // Step 3: Create Rebind if verifier_token provided
        if (verifier_token) {
            const rebindResult = await callGarena('/game/account_security/bind:create_rebind_request', {
                access_token,
                email,
                identity_token,
                verifier_token
            });

            if (!rebindResult.success) {
                return res.status(500).json({ success: false, error: rebindResult.error });
            }

            return res.json({
                success: true,
                step: 'complete',
                message: 'All steps completed',
                identity_token,
                rebind_data: rebindResult.data
            });
        }

        // Only OTP verified
        return res.json({
            success: true,
            step: 'otp_verified',
            message: 'OTP verified. Provide verifier_token to complete.',
            identity_token
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Individual Endpoints
app.post('/api/send-otp', async (req, res) => {
    try {
        const { access_token, email } = req.body;
        if (!access_token || !email) {
            return res.status(400).json({ success: false, error: 'access_token and email required' });
        }
        const result = await callGarena('/game/account_security/bind:send_otp', {
            access_token, email, locale: 'en_IN'
        });
        res.json({ success: result.success, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    try {
        const { access_token, email, otp } = req.body;
        if (!access_token || !email || !otp) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        const result = await callGarena('/game/account_security/bind:verify_identity', {
            access_token, email, otp
        });
        res.json({ 
            success: result.success, 
            identity_token: result.data?.identity_token,
            data: result.data 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/create-rebind', async (req, res) => {
    try {
        const { access_token, email, identity_token, verifier_token } = req.body;
        if (!access_token || !email || !identity_token || !verifier_token) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        const result = await callGarena('/game/account_security/bind:create_rebind_request', {
            access_token, email, identity_token, verifier_token
        });
        res.json({ success: result.success, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
