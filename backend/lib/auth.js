const { betterAuth } = require("better-auth");
const { MongoClient } = require("mongodb");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");

const client = new MongoClient(process.env.MONGO_URI);

const db = client.db("red-reach");

const auth = betterAuth({
    database: mongodbAdapter(db, {
        client,
    }),

    trustedOrigins: [
        "http://localhost:3000",
    ],

    emailAndPassword: {
        enabled: true,
    },

    user: {
        additionalFields: {
            image: {
                type: "string",
                required: false,
            },
            bloodGroup: {
                type: "string",
                required: true,
            },
            district: {
                type: "string",
                required: true,
            },
            upazila: {
                type: "string",
                required: true,
            },
            role: {
                type: "string",
                required: true,
                defaultValue: "donor",
                input: false,
            },
            status: {
                type: "string",
                required: true,
                defaultValue: "active",
                input: false,
            },
        },
    },
});

module.exports = { auth };