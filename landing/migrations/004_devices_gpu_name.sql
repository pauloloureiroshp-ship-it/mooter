-- MP-16 PEÇA 1: adicionar gpu_name à tabela devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS gpu_name TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS gpu_vram_mb INTEGER;
