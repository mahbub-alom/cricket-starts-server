const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// verify jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qud1tkv.mongodb.net/?retryWrites=true&w=majority`;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qud1tkv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // collection
    const userCollections = await client.db("sportsZone").collection("users");
    const paymentCollection = await client
      .db("sportsZone")
      .collection("payments");
    const classCollections = await client
      .db("sportsZone")
      .collection("classes");
    const selectedClassCollection = await client
      .db("sportsZone")
      .collection("selectedClasses");
    const reviewsCollection = client.db("sportsZone").collection("reviews");

    //reviews collection
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // jwt post -------------------------------------------------------
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });

      res.send({ token });
    });

    // verify admin -------------------------------------------
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };
    // verify instructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // users operations ---------------------------------------------
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const sort = { createdAt: -1 };
      const result = await userCollections.find().sort(sort).toArray();
      res.send(result);
    });

    // is admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollections.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // is instructor
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await userCollections.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.delete("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };

      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      } else {
        const result = await userCollections.insertOne(user);
        res.send(result);
      }
    });

    app.patch("/users/role", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const role = req.query.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: `${role}`,
        },
      };

      const result = await userCollections.updateOne(filter, updateDoc);
      res.send(result);
    });
    // instructor api
    app.get("/users/instructors", async (req, res) => {
      const filter = { role: "instructor" };
      const result = await userCollections.find(filter).toArray();
      res.send(result);
    });

    // classes operations =========================================================
    app.get("/classes", verifyJWT, verifyAdmin, async (req, res) => {
      const sort = { createdAt: -1 };
      const result = await classCollections.find().sort(sort).toArray();
      res.send(result);
    });

    app.get("/classes/popular", async (req, res) => {
      const sort = { totalEnrolled: -1 };
      const filter = { status: "approved" };
      const result = await classCollections
        .find(filter)
        .sort(sort)
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/classes/approved", async (req, res) => {
      const filter = { status: "approved" };
      const sort = { createdAt: -1 };
      const result = await classCollections.find(filter).sort(sort).toArray();
      res.send(result);
    });
    app.get("/classes/denied", verifyJWT, verifyAdmin, async (req, res) => {
      const filter = { status: "denied" };
      const sort = { createdAt: -1 };
      const result = await classCollections.find(filter).sort(sort).toArray();
      res.send(result);
    });

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const classData = req.body;
      const result = await classCollections.insertOne(classData);
      res.send(result);
    });

    app.patch(
      "/classes/update",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const cls = req.body.classData;
        const filter = { _id: new ObjectId(cls?.classId) };
        const updateDoc = {
          $set: {
            className: `${cls?.className}`,
            classImage: `${cls?.classImage}`,
            availableSeats: `${cls?.availableSeats}`,
            price: `${cls?.price}`,
          },
        };

        const result = await classCollections.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.patch("/classes/status", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const status = req.query.status;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: `${status}`,
        },
      };

      const result = await classCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/classes/feedback", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const feedback = req.query.feedback;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: `${feedback}`,
        },
      };
      const result = await classCollections.updateOne(filter, updateDoc);
      res.send(result);
    });

    // my selected classes
    app.get("/classes/selected", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const filter = { studentEmail: email };
      const result = await selectedClassCollection.find(filter).toArray();
      res.send(result);
    });

    app.post("/classes/selected", verifyJWT, async (req, res) => {
      const classData = req.body;
      const result = await selectedClassCollection.insertOne(classData);
      res.send(result);
    });

    app.delete("/classes/selected", async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      // const query = {_id: id};
      const query = { classId: id };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // payment methods stripe
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      console.log("sdf", payment);
      const filter = { _id: new ObjectId(payment.classId) };
      const oldClass = await classCollections.findOne(filter);

      const newSeat = parseFloat(oldClass?.availableSeats) - 1;
      const newTotalEnrolled = parseFloat(oldClass?.totalEnrolled) + 1;

      const updateDoc = {
        $set: {
          availableSeats: `${newSeat}`,
          totalEnrolled: `${newTotalEnrolled}`,
        },
      };
      const updateResult = await classCollections.updateOne(filter, updateDoc);

      const postResult = await paymentCollection.insertOne(payment);
      res.send({ postResult, updateResult });
    });

    app.get("/payments/history", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });
    app.get("/payments/enrolled/student", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const filter = { studentEmail: email };
      const result = await paymentCollection.find(filter).toArray();
      res.send(result);
    });
    app.get(
      "/payments/enrolled/instructor",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.query.email;
        const filter = { instructorEmail: email };
        const result = await classCollections.find(filter).toArray();
        res.send(result);
      }
    );

    //get top instructor

    app.get("/instructors/popular", async (req, res) => {
      const filter = { role: "instructor" };
      const result = await userCollections.find(filter).toArray();
      res.send(result);
    });

    // below code is unfortunately not working
    //     app.get("/instructors/popular", async (req, res) => {
    //       try {
    //       // I make a empty array for push all seleted instructors and send to the client.
    //         const selectedInstructors = [];

    //         // now i get the populat instructor based on the students enroll information
    //         const popularInstructors = await classCollections
    //           .aggregate([
    //             {
    //               $group: {
    //                 _id: "$instructorEmail",
    //                 totalEnrolled: { $sum: 1 },
    //               },
    //             },
    //             { $sort: { totalEnrolled: -1 } },
    //             { $limit: 6 },
    //           ])
    //           .toArray();
    // // then i matched the instructorEmails with the popularInstructors
    //         const paymentInstructors = await paymentCollection
    //           .aggregate([
    //             {
    //               $match: {
    //                 instructorEmail: { $in: popularInstructors.map((i) => i._id) },
    //               },
    //             },
    //             {
    //               $group: {
    //                 _id: "$instructorEmail",
    //                 totalPayments: { $sum: 1 },
    //               },
    //             },
    //           ])
    //           .toArray();

    //         for (const instructor of popularInstructors) {
    //           const paymentInstructor = paymentInstructors.find(
    //             (i) => i._id === instructor._id
    //           );
    //           if (paymentInstructor) {
    //             selectedInstructors.push({
    //               name: instructor._id,
    //               email: instructor._id,
    //               totalEnrolled: instructor.totalEnrolled,
    //             });
    //           }
    //         }
    // // now matching with the user collection and this will be the output
    //         const instructorEmails = selectedInstructors.map(
    //           (instructor) => instructor.email
    //         );
    //         const users = await userCollections
    //           .find({ email: { $in: instructorEmails } })
    //           .toArray();

    //         const finalResult = users.map((user) => {
    //           const instructor = selectedInstructors.find(
    //             (i) => i.email === user.email
    //           );
    //           return {
    //             name: user.name,
    //             email: user.email,
    //             totalEnrolled: instructor.totalEnrolled,
    //             image: user.photoURL,
    //           };
    //         });

    //         // here we get the instructors who are now popular
    //         const remainingInstructors = await userCollections
    //           .find({ email: { $nin: instructorEmails } })
    //           .toArray();

    //         // here we added the rest instructors if there class have no enroll . because if there are only two instructor who are popular then in the home page we will show only two instructor info . so we added lest instructors for display in the home page
    //         const restInstructors = remainingInstructors.map((instructor) => ({
    //           name: instructor.name,
    //           email: instructor.email,
    //           totalEnrolled: 0, // Set the enrollment count to 0 for the remaining instructors
    //           image: instructor.photoURL,
    //         }));

    //         const completeResult = [...finalResult, ...restInstructors];

    //         res.json(completeResult);
    //       } catch (error) {
    //         console.error(error);
    //         res.status(500).send("Internal Server Error");
    //       }
    //     });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// server run
app.get("/", (req, res) => {
  res.send("Sport Zone is running...");
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
