const express = require("express");
const { ObjectId } = require("mongodb");

const {
    requireAuth,
    requireActiveUser,
    requireRole,
} = require("../middleware/auth");

const router = express.Router();

let requestsCollection;

const BLOOD_GROUPS = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
];

const STATUSES = [
    "pending",
    "inprogress",
    "done",
    "canceled",
];

const CREATE_FIELDS = [
    "recipientName",
    "recipientDistrict",
    "recipientUpazila",
    "hospitalName",
    "fullAddress",
    "bloodGroup",
    "donationDate",
    "donationTime",
    "requestMessage",
];

function setRequestsCollection(collection) {
    requestsCollection = collection;
}

function isValidId(id) {
    return ObjectId.isValid(id);
}

function validateRequestFields(body) {
    for (const field of CREATE_FIELDS) {
        if (
            typeof body[field] !== "string" ||
            !body[field].trim()
        ) {
            return `${field} is required.`;
        }
    }

    if (!BLOOD_GROUPS.includes(body.bloodGroup)) {
        return "Invalid blood group.";
    }

    return null;
}


// ======================================================
// CREATE DONATION REQUEST
// POST /requests
// ======================================================

router.post(
    "/",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const validationError =
                validateRequestFields(req.body);

            if (validationError) {
                return res.status(400).json({
                    message: validationError,
                });
            }

            const {
                recipientName,
                recipientDistrict,
                recipientUpazila,
                hospitalName,
                fullAddress,
                bloodGroup,
                donationDate,
                donationTime,
                requestMessage,
            } = req.body;

            const now = new Date();

            const donationRequest = {
                requesterId: req.user.id,
                requesterName: req.user.name,
                requesterEmail: req.user.email,

                recipientName: recipientName.trim(),
                recipientDistrict: recipientDistrict.trim(),
                recipientUpazila: recipientUpazila.trim(),
                hospitalName: hospitalName.trim(),
                fullAddress: fullAddress.trim(),
                bloodGroup,
                donationDate,
                donationTime,
                requestMessage: requestMessage.trim(),

                // Always controlled by backend
                status: "pending",

                // Filled when someone accepts the request
                donorId: null,
                donorName: null,
                donorEmail: null,

                createdAt: now,
                updatedAt: now,
            };

            const result =
                await requestsCollection.insertOne(
                    donationRequest
                );

            res.status(201).json({
                message:
                    "Donation request created successfully.",
                request: {
                    _id: result.insertedId,
                    ...donationRequest,
                },
            });
        } catch (error) {
            console.error(
                "Create donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to create donation request.",
            });
        }
    }
);


// ======================================================
// GET MY DONATION REQUESTS
// GET /requests/my
// ======================================================

router.get(
    "/my",
    requireAuth,
    async (req, res) => {
        try {
            const page = Math.max(
                parseInt(req.query.page, 10) || 1,
                1
            );

            const limit = Math.min(
                Math.max(
                    parseInt(req.query.limit, 10) || 10,
                    1
                ),
                50
            );

            const status = req.query.status || "all";

            if (
                status !== "all" &&
                !STATUSES.includes(status)
            ) {
                return res.status(400).json({
                    message: "Invalid status filter.",
                });
            }

            const filter = {
                requesterId: req.user.id,
            };

            if (status !== "all") {
                filter.status = status;
            }

            const skip = (page - 1) * limit;

            const [requests, totalRequests] =
                await Promise.all([
                    requestsCollection
                        .find(filter)
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray(),

                    requestsCollection.countDocuments(
                        filter
                    ),
                ]);

            res.json({
                requests,
                pagination: {
                    currentPage: page,
                    limit,
                    totalRequests,
                    totalPages: Math.ceil(
                        totalRequests / limit
                    ),
                },
            });
        } catch (error) {
            console.error(
                "Get my donation requests error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch donation requests.",
            });
        }
    }
);


// ======================================================
// GET ALL PENDING REQUESTS - PUBLIC
// GET /requests/pending
// ======================================================

router.get(
    "/pending",
    async (req, res) => {
        try {
            const requests =
                await requestsCollection
                    .find({
                        status: "pending",
                    })
                    .sort({ createdAt: -1 })
                    .toArray();

            res.json({
                requests,
            });
        } catch (error) {
            console.error(
                "Get pending requests error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch pending requests.",
            });
        }
    }
);


// ======================================================
// GET ALL REQUESTS
// ADMIN / VOLUNTEER
// GET /requests
// ======================================================

router.get(
    "/",
    requireAuth,
    requireRole("admin", "volunteer"),
    async (req, res) => {
        try {
            const page = Math.max(
                parseInt(req.query.page, 10) || 1,
                1
            );

            const limit = Math.min(
                Math.max(
                    parseInt(req.query.limit, 10) || 10,
                    1
                ),
                50
            );

            const status = req.query.status || "all";

            if (
                status !== "all" &&
                !STATUSES.includes(status)
            ) {
                return res.status(400).json({
                    message: "Invalid status filter.",
                });
            }

            const filter = {};

            if (status !== "all") {
                filter.status = status;
            }

            const skip = (page - 1) * limit;

            const [requests, totalRequests] =
                await Promise.all([
                    requestsCollection
                        .find(filter)
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray(),

                    requestsCollection.countDocuments(
                        filter
                    ),
                ]);

            res.json({
                requests,
                pagination: {
                    currentPage: page,
                    limit,
                    totalRequests,
                    totalPages: Math.ceil(
                        totalRequests / limit
                    ),
                },
            });
        } catch (error) {
            console.error(
                "Get all donation requests error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch donation requests.",
            });
        }
    }
);


// ======================================================
// GET SINGLE REQUEST
// GET /requests/:id
// ======================================================

router.get(
    "/:id",
    requireAuth,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const request =
                await requestsCollection.findOne({
                    _id: new ObjectId(id),
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            res.json({
                request,
            });
        } catch (error) {
            console.error(
                "Get donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch donation request.",
            });
        }
    }
);


// ======================================================
// DONATE / ACCEPT REQUEST
// POST /requests/:id/donate
// ======================================================

router.post(
    "/:id/donate",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            if (request.status !== "pending") {
                return res.status(400).json({
                    message:
                        "This donation request is no longer available.",
                });
            }

            // Requester cannot donate to their own request
            if (request.requesterId === req.user.id) {
                return res.status(400).json({
                    message:
                        "You cannot donate to your own request.",
                });
            }

            const result =
                await requestsCollection.updateOne(
                    {
                        _id: requestId,
                        status: "pending",
                    },
                    {
                        $set: {
                            status: "inprogress",

                            donorId: req.user.id,
                            donorName: req.user.name,
                            donorEmail: req.user.email,

                            updatedAt: new Date(),
                        },
                    }
                );

            // Prevent two users accepting the same request
            if (result.modifiedCount === 0) {
                return res.status(409).json({
                    message:
                        "This donation request has already been accepted.",
                });
            }

            const updatedRequest =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            res.json({
                message:
                    "Donation request accepted successfully.",
                request: updatedRequest,
            });
        } catch (error) {
            console.error(
                "Donate request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to accept donation request.",
            });
        }
    }
);


// ======================================================
// UPDATE REQUEST
// PATCH /requests/:id
// ADMIN OR REQUEST OWNER
// ======================================================

router.patch(
    "/:id",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            const isAdmin =
                req.user.role === "admin";

            const isOwner =
                request.requesterId === req.user.id;

            if (!isAdmin && !isOwner) {
                return res.status(403).json({
                    message:
                        "You can only update your own donation requests.",
                });
            }

            if (
                request.status === "done" ||
                request.status === "canceled"
            ) {
                return res.status(400).json({
                    message:
                        "Completed or canceled requests cannot be updated.",
                });
            }

            const updates = {};

            for (const field of CREATE_FIELDS) {
                if (req.body[field] !== undefined) {
                    if (
                        typeof req.body[field] !== "string" ||
                        !req.body[field].trim()
                    ) {
                        return res.status(400).json({
                            message:
                                `${field} cannot be empty.`,
                        });
                    }

                    updates[field] =
                        req.body[field].trim();
                }
            }

            if (
                updates.bloodGroup &&
                !BLOOD_GROUPS.includes(
                    updates.bloodGroup
                )
            ) {
                return res.status(400).json({
                    message: "Invalid blood group.",
                });
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    message:
                        "No valid fields provided for update.",
                });
            }

            updates.updatedAt = new Date();

            await requestsCollection.updateOne(
                { _id: requestId },
                { $set: updates }
            );

            const updatedRequest =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            res.json({
                message:
                    "Donation request updated successfully.",
                request: updatedRequest,
            });
        } catch (error) {
            console.error(
                "Update donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to update donation request.",
            });
        }
    }
);


// ======================================================
// MARK REQUEST AS DONE
// PATCH /requests/:id/done
// REQUEST OWNER OR ADMIN
// ======================================================

router.patch(
    "/:id/done",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            const isAdmin =
                req.user.role === "admin";

            const isOwner =
                request.requesterId === req.user.id;

            if (!isAdmin && !isOwner) {
                return res.status(403).json({
                    message:
                        "You do not have permission to complete this request.",
                });
            }

            if (request.status !== "inprogress") {
                return res.status(400).json({
                    message:
                        "Only in-progress requests can be marked as done.",
                });
            }

            await requestsCollection.updateOne(
                {
                    _id: requestId,
                    status: "inprogress",
                },
                {
                    $set: {
                        status: "done",
                        updatedAt: new Date(),
                    },
                }
            );

            const updatedRequest =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            res.json({
                message:
                    "Donation request marked as done.",
                request: updatedRequest,
            });
        } catch (error) {
            console.error(
                "Complete donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to complete donation request.",
            });
        }
    }
);


// ======================================================
// CANCEL REQUEST
// PATCH /requests/:id/cancel
// REQUEST OWNER OR ADMIN
// ======================================================

router.patch(
    "/:id/cancel",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            const isAdmin =
                req.user.role === "admin";

            const isOwner =
                request.requesterId === req.user.id;

            if (!isAdmin && !isOwner) {
                return res.status(403).json({
                    message:
                        "You do not have permission to cancel this request.",
                });
            }

            if (request.status !== "inprogress") {
                return res.status(400).json({
                    message:
                        "Only in-progress requests can be canceled.",
                });
            }

            await requestsCollection.updateOne(
                {
                    _id: requestId,
                    status: "inprogress",
                },
                {
                    $set: {
                        status: "canceled",
                        updatedAt: new Date(),
                    },
                }
            );

            const updatedRequest =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            res.json({
                message:
                    "Donation request canceled.",
                request: updatedRequest,
            });
        } catch (error) {
            console.error(
                "Cancel donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to cancel donation request.",
            });
        }
    }
);


// ======================================================
// VOLUNTEER / ADMIN STATUS UPDATE
// PATCH /requests/:id/status
// ======================================================

router.patch(
    "/:id/status",
    requireAuth,
    requireActiveUser,
    requireRole("admin", "volunteer"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            if (!STATUSES.includes(status)) {
                return res.status(400).json({
                    message: "Invalid status.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            /*
             * Volunteer can only manage status.
             *
             * We still enforce sensible transitions:
             *
             * pending -> inprogress
             * inprogress -> done/canceled
             */

            if (
                request.status === "pending" &&
                status !== "inprogress"
            ) {
                return res.status(400).json({
                    message:
                        "A pending request can only be changed to inprogress.",
                });
            }

            if (
                request.status === "inprogress" &&
                !["done", "canceled"].includes(status)
            ) {
                return res.status(400).json({
                    message:
                        "An in-progress request can only be marked done or canceled.",
                });
            }

            if (
                request.status === "done" ||
                request.status === "canceled"
            ) {
                return res.status(400).json({
                    message:
                        "Completed or canceled requests cannot be changed.",
                });
            }

            const update = {
                status,
                updatedAt: new Date(),
            };

            /*
             * If admin/volunteer changes a pending request
             * to inprogress, we don't invent donor information.
             *
             * The normal donor acceptance flow should use
             * POST /:id/donate.
             */

            await requestsCollection.updateOne(
                { _id: requestId },
                { $set: update }
            );

            const updatedRequest =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            res.json({
                message:
                    "Donation request status updated successfully.",
                request: updatedRequest,
            });
        } catch (error) {
            console.error(
                "Update request status error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to update request status.",
            });
        }
    }
);


// ======================================================
// DELETE REQUEST
// DELETE /requests/:id
// ADMIN OR REQUEST OWNER
// ======================================================

router.delete(
    "/:id",
    requireAuth,
    requireActiveUser,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!isValidId(id)) {
                return res.status(400).json({
                    message: "Invalid request ID.",
                });
            }

            const requestId = new ObjectId(id);

            const request =
                await requestsCollection.findOne({
                    _id: requestId,
                });

            if (!request) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            const isAdmin =
                req.user.role === "admin";

            const isOwner =
                request.requesterId === req.user.id;

            if (!isAdmin && !isOwner) {
                return res.status(403).json({
                    message:
                        "You can only delete your own donation requests.",
                });
            }

            const result =
                await requestsCollection.deleteOne({
                    _id: requestId,
                });

            if (!result.deletedCount) {
                return res.status(404).json({
                    message:
                        "Donation request not found.",
                });
            }

            res.json({
                message:
                    "Donation request deleted successfully.",
            });
        } catch (error) {
            console.error(
                "Delete donation request error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to delete donation request.",
            });
        }
    }
);


module.exports = {
    router,
    setRequestsCollection,
};