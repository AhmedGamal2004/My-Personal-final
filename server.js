import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const sql = neon(process.env.DATABASE_URL);

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Higher limit for Base64 assets
app.use(express.static('public'));

// --- API ROUTES ---

// Get Profile
app.get('/api/get-profile', async (req, res) => {
    try {
        const settings = await sql`SELECT * FROM settings WHERE id = 1`;
        res.json(settings[0] || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Profile
app.post('/api/update-profile', async (req, res) => {
    try {
        const { name, bio, avatar, cover } = req.body;
        await sql`
            UPDATE settings 
            SET 
                name = COALESCE(${name || null}, name),
                bio = COALESCE(${bio || null}, bio),
                avatar = COALESCE(${avatar || null}, avatar),
                cover = COALESCE(${cover || null}, cover)
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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
