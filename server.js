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
        dbUrl = dbUrl.replace(/['"]/g, '').trim();
        sql = neon(dbUrl);
    } else {
        console.error("CRITICAL: DATABASE_URL is missing!");
    }
} catch (error) {
    console.error("CRITICAL: Failed to initialize database connection:", error.message);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ahmed123';

const isAdmin = (req, res, next) => {
    const providedPassword = req.headers['x-admin-password'];
    if (providedPassword === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(403).json({ error: "Unauthorized: Admin access required" });
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('Public'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database_configured: !!process.env.DATABASE_URL });
});

app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Invalid password" });
    }
});

// Profile Routes
app.get('/api/get-profile', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        let settings = await sql`SELECT * FROM settings WHERE id = 1`;
        if (settings.length === 0) {
            await sql`INSERT INTO settings (id, name, bio) VALUES (1, 'Ahmed Gamal', 'Welcome to my space') ON CONFLICT (id) DO NOTHING`;
            settings = await sql`SELECT * FROM settings WHERE id = 1`;
        }
        res.json(settings[0] || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/update-profile', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        const { name, bio, avatar, cover } = req.body;
        await sql`INSERT INTO settings (id, name, bio) VALUES (1, 'Ahmed Gamal', 'Welcome') ON CONFLICT (id) DO NOTHING`;
        await sql`
            UPDATE settings SET 
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

// Messages & Audio Routes
app.get('/api/get-messages', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        
        // Migration: Ensure columns exist
        try { 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS cover_image TEXT DEFAULT ''`; 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS lyrics TEXT DEFAULT ''`;
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`;
        } catch(e){}

        const messages = await sql`
            SELECT id, type, title, artist, created_at, cover_image, lyrics, description,
                   CASE WHEN type = 'audio' THEN 'REFER_TO_BINARY_ROUTE' ELSE content END as content
            FROM messages ORDER BY created_at ASC
        `;
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/create-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        const { content, type = 'text', title, artist, cover_image = '', lyrics = '', description = '' } = req.body;
        
        try { 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS cover_image TEXT DEFAULT ''`; 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS lyrics TEXT DEFAULT ''`;
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`;
        } catch(e){}

        await sql`INSERT INTO messages (content, type, title, artist, cover_image, lyrics, description) 
                  VALUES (${content}, ${type}, ${title || ''}, ${artist || ''}, ${cover_image}, ${lyrics}, ${description})`;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/audio/:id', async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        const { id } = req.params;
        const row = await sql`SELECT content FROM messages WHERE id = ${id} AND type = 'audio'`;
        if (row.length === 0) return res.status(404).send("Not found");

        const base64Data = row[0].content;
        const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(base64String, 'base64');

        const range = req.headers.range;
        const totalSize = buffer.length;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": "audio/mpeg",
            });
            res.end(buffer.slice(start, end + 1));
        } else {
            res.writeHead(200, {
                "Content-Length": totalSize,
                "Content-Type": "audio/mpeg",
            });
            res.end(buffer);
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/api/update-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        const { id, content, title, artist, cover_image, lyrics, description } = req.body;
        if (!id) return res.status(400).json({ error: "ID is required" });

        // Ensure the table has the columns
        try { 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS cover_image TEXT DEFAULT ''`; 
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS lyrics TEXT DEFAULT ''`;
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`;
        } catch(e){}

        if (content !== undefined) await sql`UPDATE messages SET content = ${content} WHERE id = ${id}`;
        if (title !== undefined) await sql`UPDATE messages SET title = ${title} WHERE id = ${id}`;
        if (artist !== undefined) await sql`UPDATE messages SET artist = ${artist} WHERE id = ${id}`;
        if (cover_image !== undefined) await sql`UPDATE messages SET cover_image = ${cover_image} WHERE id = ${id}`;
        if (lyrics !== undefined) await sql`UPDATE messages SET lyrics = ${lyrics} WHERE id = ${id}`;
        if (description !== undefined) await sql`UPDATE messages SET description = ${description} WHERE id = ${id}`;

        res.json({ success: true });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/delete-message', isAdmin, async (req, res) => {
    try {
        if (!sql) return res.status(500).json({ error: "Database not configured" });
        const { id } = req.body;
        await sql`DELETE FROM messages WHERE id = ${id}`;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

export default app;
