// ✅ Import dependencies
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const admin = require("firebase-admin");
const cloudinary = require("cloudinary").v2;
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Load Firebase credentials from environment variable instead of file
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ✅ Configure Cloudinary (reads from .env)
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ✅ Multer setup (for file uploads)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ POST /report → upload image to Cloudinary + save to Firestore
app.post("/report", upload.single("image"), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!req.file) return res.status(400).json({ error: "Image required" });
    if (!latitude || !longitude)
      return res.status(400).json({ error: "Location required" });

    // Upload image to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "reports" },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload failed:", error);
          return res.status(500).json({ error: "Cloudinary upload failed" });
        }

        // Save info to Firestore
        await db.collection("reports").add({
          imageUrl: result.secure_url,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, imageUrl: result.secure_url });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET /reports → list all reports
app.get("/reports", async (req, res) => {
  try {
    const snap = await db.collection("reports").orderBy("timestamp", "desc").get();
    const reports = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

// ✅ Serve NGO viewer
app.use("/viewer", express.static(path.join(__dirname, "viewer")));

// ✅ Root route
app.get("/", (req, res) => res.send("✅ Backend running with Cloudinary + Firestore"));

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
