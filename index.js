const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { fromNodeHeaders } = require("better-auth/node");

require("dotenv").config();

const { auth } = require("./backend/lib/auth");

const {
    router: requestRoutes,
    setRequestsCollection,
} = require("./backend/routes/requestRoutes");

const app = express();
const port = process.env.PORT || 8000;

const uri = process.env.MONGO_URI;


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true,
    })
);

app.use(express.json());


// ======================================================
// MONGODB
// ======================================================

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});


// ======================================================
// BASIC ROUTE
// ======================================================

app.get("/", (req, res) => {
    res.json({
        message: "RedReach API is running!",
    });
});


// ======================================================
// AUTH TEST
// ======================================================

app.get("/auth/me", async (req, res) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session?.user) {
            return res.status(401).json({
                message: "Not logged in",
            });
        }

        res.json({
            message: "Authentication works!",
            user: session.user,
        });
    } catch (error) {
        console.error("Auth test error:", error);

        res.status(500).json({
            message: "Authentication test failed",
            error: error.message,
        });
    }
});


// ======================================================
// START SERVER
// ======================================================

async function run() {
    try {
        await client.connect();

        const database = client.db("red-reach");

        const requestsCollection =
            database.collection("requests");

        // Give request routes access to MongoDB
        setRequestsCollection(requestsCollection);

        // Donation request API
        app.use("/requests", requestRoutes);

        // Test MongoDB connection
        await database.command({ ping: 1 });

        console.log(
            "Successfully connected to MongoDB!"
        );

        app.listen(port, () => {
            console.log(
                `RedReach server running on http://localhost:${port}`
            );
        });
    } catch (error) {
        console.error(
            "Failed to start RedReach server:",
            error
        );
    }
}

run();