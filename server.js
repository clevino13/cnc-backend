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

let serviceAccount;

// ✅ Use FIREBASE_CONFIG on Render, file locally
if (process.env.FIREBASE_CONFIG) {
  serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
} else {
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ✅ Cloudinary from .env
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ✅ Multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ POST /report → upload image + save to Firestore
app.post("/report", upload.single("image"), async (req, res) => {
  try {
    const { latitude, longitude, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }
    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Location required" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "reports" },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload failed:", error);
          return res
            .status(500)
            .json({ error: "Cloudinary upload failed" });
        }

        await db.collection("reports").add({
          imageUrl: result.secure_url,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          description: description || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, imageUrl: result.secure_url });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error("Server error in /report:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ GET /reports → list all reports
app.get("/reports", async (req, res) => {
  try {
    const snap = await db
      .collection("reports")
      .orderBy("timestamp", "desc")
      .get();
    const reports = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(reports);
  } catch (err) {
    console.error("Fetch failed:", err);
    res.status(500).json({ error: "Fetch failed" });
  }
});

// 🗑️ DELETE /report/:id → delete from Firestore + Cloudinary
app.delete("/report/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const docRef = db.collection("reports").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Report not found" });
    }

    const report = docSnap.data();
    const imageUrl = report.imageUrl;

    // Extract Cloudinary public_id from URL
    const parts = imageUrl.split("/");
    const publicIdWithExt = parts.slice(parts.indexOf("upload") + 2).join("/");
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, "");

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Delete from Firestore
    await docRef.delete();

    res.json({ success: true, message: "Image deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ✅ Serve NGO viewer (static HTML)
app.use("/viewer", express.static(path.join(__dirname, "viewer")));

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Backend running with Cloudinary + Firestore");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Backend running on port ${PORT}`)
);
