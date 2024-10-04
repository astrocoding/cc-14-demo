import express from "express";
import dotenv from "dotenv";
import { Storage } from "@google-cloud/storage";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images, pdf, and documents are allowed!"));
    }
  }
});

const gc = new Storage({
  keyFilename: path.join(__dirname, process.env.KEY_PATH), 
  projectId: process.env.GCLOUD_PROJECT_ID,
});

const bucket = gc.bucket(process.env.GCLOUD_BUCKET);

const generateRandomName = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

app.get("/", (req, res) => {
  res.send("<h1>File Upload API</h1>");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: "No file uploaded." });
  }

  const description = req.body.description || "No description provided.";

  const randomName = generateRandomName(8) + path.extname(req.file.originalname);
  const blob = bucket.file(randomName);
  const blobStream = blob.createWriteStream({
    resumable: false,
    gzip: true,
  });

  blobStream.on("error", (err) => {
    console.error(err);
    res.status(500).send({ message: "Error uploading file.", error: err.message });
  });

  blobStream.on("finish", async () => {
    try {
      await blob.makePublic();

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      res.status(200).send({ 
        message: "File uploaded successfully.", 
        url: publicUrl,
        description: description,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Error making file public.", error: error.message });
    }
  });

  blobStream.end(req.file.buffer);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).send({ message: err.message });
  } else if (err) {
    res.status(500).send({ message: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
