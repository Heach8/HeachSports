import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + '-' + safe);
  }
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo' || file.fieldname === 'logo' || file.fieldname === 'image') {
      return cb(null, IMAGE_TYPES.includes(file.mimetype));
    }
    if (file.fieldname === 'eligibility_doc') {
      return cb(null, DOC_TYPES.includes(file.mimetype));
    }
    cb(null, false);
  }
});
