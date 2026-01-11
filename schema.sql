-- Run this in your Neon SQL Editor to create the necessary table

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    type VARCHAR(10) DEFAULT 'text', -- 'text' or 'audio'
    title TEXT,                      -- Song title for audio
    artist TEXT,                     -- Artist name for audio
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'Ahmed Gamal',
    bio TEXT DEFAULT 'Video Editor | Content Creator',
    avatar TEXT, -- Base64 encoded image
    cover TEXT,   -- Base64 encoded image
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize settings if not exists
INSERT INTO settings (id, name, bio) 
VALUES (1, 'Ahmed Gamal', 'Video Editor | Content Creator')
ON CONFLICT (id) DO NOTHING;
