const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { fromNodeHeaders } = require("better-auth/node");

require("dotenv").config();

const { auth } = require("./backend/lib/auth");


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
        const usersCollection = database.collection("user");
        const requestCollection = database.collection("requests");


        app.get("/api/users", async(req, res) => {
            const cursor = usersCollection.find();
            const users = await cursor.toArray();
            res.send(users);
        })

        app.get("/api/donation-requests", async(req, res) => {
            const cursor = requestCollection.find();
            const requests = await cursor.toArray();
            res.send(requests);
        })

        app.get('/api/donation-requests/user/:userID', async (req, res) => {
            const id = req.params.userID;
            const query = {
                requesterId: id
            }
            const cursor = requestCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/api/donation-requests/details/:id', async (req, res) => {
            const { id } = req.params;
            const query = {
                _id: new ObjectId(id)
            }
            const result = await requestCollection.findOne(query);
            console.log("Found request:", result);
            res.send(result);
        })

        app.post("/api/donation-requests", async(req, res) => {
            const formData = req.body;
            const newRequest = {
                ...formData,
                updatedDate: new Date()
            }
            const result = await requestCollection.insertOne(newRequest);
            res.send(result)
        })

        app.patch("/api/donation-requests/:id", async(req, res) => {
            
            const { id } = req.params;
            const data = req.body;
            
            const result = await requestCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                            ...data,
                            updatedDate: new Date(),
                          },
                }
            );
            res.send(result)
        })

        app.delete("/api/donation-requests/:id", async (req, res) => {
            const { id } = req.params;

            const result = await requestCollection.deleteOne({
                _id: new ObjectId(id),
            });

            res.send(result);
        });



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

app.post(
    "/api/upload-image",
    express.raw({
        type: ["image/jpeg", "image/png", "image/webp"],
        limit: "5mb",
    }),
    async (req, res) => {
        try {
            if (!req.body || !req.body.length) {
                return res.status(400).json({
                    message: "No image provided.",
                });
            }

            const formData = new FormData();

            formData.append(
                "image",
                new Blob([req.body], {
                    type: req.headers["content-type"],
                })
            );

            const response = await fetch(
                `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
                {
                    method: "POST",
                    body: formData,
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                console.error("ImgBB error:", data);

                return res.status(500).json({
                    message: "Image upload failed.",
                });
            }

            return res.status(200).json({
                message: "Image uploaded successfully.",
                url: data.data.url,
                deleteUrl: data.data.delete_url,
            });
        } catch (error) {
            console.error("Image upload error:", error);

            return res.status(500).json({
                message: "Something went wrong while uploading the image.",
            });
        }
    }
);
