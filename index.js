const express = require("express");
const cors = require("cors");
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173',
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@polling-and-survey.ymcivji.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});







async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const surveyCollection = client.db("surveyDB").collection('surveys');
    const reviewCollection = client.db("surveyDB").collection('reviews');
    const paymentCollections = client.db('surveyDB').collection('payments');
    const userCollections = client.db('surveyDB').collection('users');
    const voteCollections = client.db('surveyDB').collection('votes');


    const verifyToken = (req, res, next) => {
      const token = req?.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === 'admin' ? true : false;
      next();
    }





    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: 60 * 60 });

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      })
        .send({ success: true });
    })

    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res.clearCookie('token', { maxAge: 0 }).send({ success: true })
    })

    app.get('/users/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const query = { email: email };
      const user = await userCollections.findOne(query);

      const isAdmin = (user?.role === 'admin' ? true : false);
      res.send({ isAdmin })
    })

    app.get('/users', verifyToken, async (req, res) => {
      const filter = req.query.role || ''
      const result = await userCollections.find(filter ? { role: filter } : {}).toArray();
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existing = await userCollections.findOne(query);
      if (existing) {
        return res.send({ message: 'user already existing', insertedId: null });
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
    })

    app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.body;
      const filter = { _id: new ObjectId(id) };
      const update = {
        $set: {
          role: role.role
        }
      }
      console.log(role)
      const result = await userCollections.updateOne(filter, update);
      res.send(result)
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result)
    })

    app.get('/surveys', async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { email: email }
      }
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await surveyCollection.findOne(query);
      res.send(result);
    })

    app.post('/surveys', verifyToken, async (req, res) => {
      const survey = req.body;
      const result = await surveyCollection.insertOne(survey);
      res.send(result)
    })

    app.put("/survey/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateStatus = {
        $set: {
          status: status.status,
          feedback: status?.feedback,
        }
      }
      const result = await surveyCollection.updateOne(filter, updateStatus, options);
      res.send(result);
    })

    app.delete('/surveys/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.deleteOne(query);
      res.send(result)
    })

    app.get('/votes', async (req, res) => {
      const result = await voteCollections.find().toArray();
      res.send(result)
    })

    app.post('/votes', async (req, res) => {
      const user = req.body;
      const id = req.body.surveyId;
      const query = { surveyId: id }
      const existing = await voteCollections.findOne(query);
      if (existing) {
        return res.send({ message: 'your vote already taken', insertedId: null });
      }
      const result = await voteCollections.insertOne(user);

      res.send(result);
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })


    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = (price * 100);

      console.log(amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      console.log(paymentIntent.client_secret)
      res.send({
        clientSecrete: paymentIntent.client_secret
      })
    })

    app.get('/payments', verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollections.find().toArray();
      res.send(result)
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollections.insertOne(payment);

      const query = {
        email: payment.email
      }
      const update = {
        $set: {
          role: 'pro-user'
        }
      }
      const userRole = await userCollections.updateOne(query, update);
      console.log(userRole, query)

      res.send({ paymentResult, userRole })

    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send('polling-and-survey is running');
})


app.listen(port, () => {
  console.log(`polling-and-survey is running on PORT: ${port}`)
})