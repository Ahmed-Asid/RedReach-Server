const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

app.use(async (req, res, next) => {
    try {
        await client.connect();
        next();
    } catch (error) {
        console.error("Mongo connection error:", error);

        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function connectDB() {
    if (db) return db;

    await client.connect();

    console.log("Connected to MongoDB Atlas!");

    db = client.db("red-reach");

    return db;
}
// ==========================================
// BASIC ROUTE
// ==========================================
app.get('/', (req, res) => {
    res.json({ message: "RedReach API is running!" });
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`))

const verifyToken = async (req, res, next) => {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")){
        res.status(401).send({msg: 'Unauthorized'})
    }

    const token = authHeader.split(" ")[1];
    if (!token){
        res.status(401).send({msg: 'Unauthorized'})
    }

    try{
        const {payload} = await jwtVerify(token, JWKS);
        req.user = payload;
        console.log(payload);
        next()
    } catch(error){
        console.log(error)
        res.status(401).send({msg: 'Unauthorized'})
    }
}

const verifyAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}

const verifyDonor = async (req, res, next) => {
    if (req.user.role !== 'donor') {
        return res.status(403).send({ message: 'forbidden access' })
    }
    next();
}

async function run() {
  try {

    const db = await connectDB();

    const usersCollection = db.collection('user');
    const requestCollection = db.collection('requests');
    const fundCollection = db.collection('donations')


    // ==========================================
    // USERS ROUTES
    // ==========================================
    app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
        const users = await usersCollection.find().toArray();
        res.send(users);
    });

    app.get('/api/users/:id', verifyToken, async(req, res) => {
        const id = req.params.id
        console.log(user,'user')
        const result = await usersCollection.findOne(
            { _id: new ObjectId(id) })
            res.send(result)
    })

    app.patch('/api/users/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const userData = req.body;
        const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...userData, updatedDate: new Date() } }
        );
        res.send(result);
    });

    // ==========================================
    // DONATION REQUESTS ROUTES
    // ==========================================
    app.get('/api/donation-requests', async (req, res) => {
        const requests = await requestCollection.find().toArray();
        res.send(requests);
    });

    app.get('/api/donation-requests/my-requests', verifyToken, async (req, res) => {
        const user = req.user;
        const result = await requestCollection.find({ requesterId: user.id }).toArray();
        res.send(result);
    });

    app.get('/api/donation-requests/details/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const result = await requestCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
    });

    app.post('/api/donation-requests', verifyToken, async (req, res) => {
        const newRequest = { ...req.body, updatedDate: new Date() };
        const result = await requestCollection.insertOne(newRequest);
        res.json(result);
    });

    app.patch('/api/donation-requests/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const result = await requestCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...updatedData, updatedDate: new Date() } }
        );
        res.send(result);
    });

    app.delete('/api/donation-requests/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const result = await requestCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
    });

    app.get('/api/donations', async (req, res) => {
        try {
            const donations = await fundCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(donations);
        } catch (error) {
            res.status(500).send({ message: "Failed to fetch donations" });
        }
    });

    app.post('/api/donations', verifyToken, async (req, res) => {
        try {
            const donationData = {
                ...req.body,
                createdAt: new Date()
            };
            const result = await fundCollection.insertOne(donationData);
            res.send(result);
        } catch (error) {
            res.status(500).send({ message: "Failed to save donation" });
        }
    });

    // ==========================================
    // DONORS SEARCH ROUTE
    // ==========================================
    app.get('/api/donors/search', async (req, res) => {
        try {
            const { bloodGroup, district, upazila } = req.query;
            const query = { role: "donor", status: "active" };

            if (bloodGroup) query.bloodGroup = bloodGroup;
            if (district) query.district = district;
            if (upazila) query.upazila = upazila;

            const donors = await usersCollection.find(query).project({ password: 0 }).toArray();
            res.send(donors);
        } catch (error) {
            console.error("Donor search error:", error);
            res.status(500).send({ message: "Failed to search donors" });
        }
    });

    // ==========================================
    // IMAGE UPLOAD API (IMGBB)
    // ==========================================
    app.post('/api/upload-image', express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), async (req, res) => {
        try {
            if (!req.body || !req.body.length) {
                return res.status(400).json({ message: "No image provided." });
            }

            const formData = new FormData();
            formData.append("image", new Blob([req.body], { type: req.headers["content-type"] }));

            const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                return res.status(500).json({ message: "Image upload failed." });
            }

            return res.status(200).json({
                message: "Image uploaded successfully.",
                url: data.data.url,
                deleteUrl: data.data.delete_url,
            });
        } catch (error) {
            console.error("Image upload error:", error);
            return res.status(500).json({ message: "Something went wrong while uploading the image." });
        }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.log(error);
  }
}

run().catch(console.dir);

module.exports = app;

if (process.env.NODE_ENV !== "production") {
    app.listen(port, () => {
        console.log(`server is running on port ${port}`);
    });
}