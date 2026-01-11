import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection check
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL is not set in environment variables!");
}

const sql = neon(process.env.DATABASE_URL || '');

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

// Get Profile
app.get('/api/get-profile', async (req, res) => {
    try {
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
app.post('/api/update-profile', async (req, res) => {
    try {
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
        const messages = await sql`SELECT * FROM messages ORDER BY created_at DESC`;
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Message
app.post('/api/create-message', async (req, res) => {
    try {
        const { content, type = 'text', title, artist } = req.body;
        if (!content) return res.status(400).json({ error: "Content is required" });

        await sql`INSERT INTO messages (content, type, title, artist) VALUES (${content}, ${type}, ${title}, ${artist})`;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Message
app.post('/api/update-message', async (req, res) => {
    try {
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
app.post('/api/delete-message', async (req, res) => {
    try {
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
