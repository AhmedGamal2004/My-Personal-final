import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection setup
let sql = null;
try {
    let dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
        // Strip accidental single or double quotes
        dbUrl = dbUrl.replace(/['"]/g, '').trim();
        sql = neon(dbUrl);
    } else {
        console.error("CRITICAL: DATABASE_URL is missing!");
    }
} catch (error) {
    console.error("CRITICAL: Failed to initialize database connection:", error.message);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ahmed123';

// Middleware to check admin password
const isAdmin = (req, res, next) => {
    const providedPassword = req.headers['x-admin-password'];
    if (providedPassword === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(403).json({ error: "Unauthorized: Admin access required" });
    }
};

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Higher limit for Base64 assets
app.use(express.static('Public'));

// --- DEBUG & HEALTH ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database_configured: !!process.env.DATABASE_URL,
        db_url_prefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 15) + '...' : 'none'
    });
});

app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid password" });
    }
});

// Get Profile
app.get('/api/get-profile', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        let settings = await sql`SELECT * FROM settings WHERE id = 1`;
        if (settings.length === 0) {
            // Auto-create if missing (e.g., new database or deleted row)
            await sql`INSERT INTO settings (id, name, bio) VALUES (1, 'Ahmed Gamal', 'Welcome to my space') ON CONFLICT (id) DO NOTHING`;
            settings = await sql`SELECT * FROM settings WHERE id = 1`;
        }
        res.json(settings[0] || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Profile
app.post('/api/update-profile', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        const { name, bio, avatar, cover } = req.body;

        // Ensure row exists first (Upsert pattern)
        await sql`
            INSERT INTO settings (id, name, bio) 
            VALUES (1, 'Ahmed Gamal', 'Welcome')
            ON CONFLICT (id) DO NOTHING
        `;

        await sql`
            UPDATE settings 
            SET 
                name = COALESCE(${name === undefined ? null : name}, name),
                bio = COALESCE(${bio === undefined ? null : bio}, bio),
                avatar = COALESCE(${avatar === undefined ? null : avatar}, avatar),
                cover = COALESCE(${cover === undefined ? null : cover}, cover)
            WHERE id = 1
        `;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Messages
app.get('/api/get-messages', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        // optimization: Don't return full audio content in the list to keep payload small
        const messages = await sql`
            SELECT id, type, title, artist, created_at,
                   CASE WHEN type = 'audio' THEN 'REFER_TO_BINARY_ROUTE' ELSE content END as content
            FROM messages 
            ORDER BY created_at ASC
        `;
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Binary Audio Upload (Avoids Base64 overhead in request)
app.post('/api/upload-audio', isAdmin, express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });

        const { title, artist } = req.query;
        const binaryData = req.body; // Buffer from express.raw()

        if (!binaryData || binaryData.length === 0) {
            return res.status(400).json({ error: "No audio data received" });
        }

        // Convert to Base64 *only* for DB storage (Prefix included for compatibility)
        const base64 = `data:audio/mpeg;base64,${binaryData.toString('base64')}`;

        await sql`INSERT INTO messages (content, type, title, artist) VALUES (${base64}, 'audio', ${title || 'Untitled'}, ${artist || 'Unknown Artist'})`;

        res.json({ success: true });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Binary Audio Download (Avoids Base64 overhead in response)
app.get('/api/audio/:id', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });

        const { id } = req.params;
        const row = await sql`SELECT content FROM messages WHERE id = ${id} AND type = 'audio'`;

        if (row.length === 0) return res.status(404).send("Not found");

        const base64Data = row[0].content;
        // Strip prefix if exists (e.g., data:audio/mpeg;base64,)
        const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        const buffer = Buffer.from(base64String, 'base64');

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Create Message
app.post('/api/create-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        const { content, type = 'text', title, artist } = req.body;
        if (!content) return res.status(400).json({ error: "Content is required" });

        await sql`INSERT INTO messages (content, type, title, artist) VALUES (${content}, ${type}, ${title}, ${artist})`;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Message
app.post('/api/update-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        const { id, content, title, artist } = req.body;
        if (!id) return res.status(400).json({ error: "ID is required" });

        if (content && title !== undefined && artist !== undefined) {
            await sql`UPDATE messages SET content = ${content}, title = ${title}, artist = ${artist} WHERE id = ${id}`;
        } else if (title !== undefined || artist !== undefined) {
            await sql`UPDATE messages SET title = ${title}, artist = ${artist} WHERE id = ${id}`;
        } else if (content) {
            await sql`UPDATE messages SET content = ${content} WHERE id = ${id}`;
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Message
app.post('/api/delete-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured on server" });
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: "ID is required" });
        await sql`DELETE FROM messages WHERE id = ${id}`;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

export default app;
