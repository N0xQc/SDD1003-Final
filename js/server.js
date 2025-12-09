// server.js
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const path = require('path');
// fetch is built-in in Node.js 18+, no import needed
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// MongoDB connection
const url = process.env.MONGODB_URI || 'mongodb+srv://final:mdpfinal@cours.8vksavx.mongodb.net/steam_data?retryWrites=true&w=majority';
let db;

// Connect to MongoDB and start server
MongoClient.connect(url)
    .then(client => {
        console.log('Connected to MongoDB Atlas');
        db = client.db('steam_data');
        
        // Start server
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Visit http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    });


// Route pour récupérer tous les documents de la collection 'games' (GET)
app.get('/games', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        console.log('Fetching games...');
        const games = await db.collection('games')
            .find({})
            .limit(100)
            .toArray();
        
        console.log(`Returning ${games.length} games`);
        res.status(200).json(games);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Impossible de récupérer les documents.' });
    }
});


// Recherche et auto-completion (GET)
app.get('/search', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const query = req.query.q;
        console.log(`Searching for games matching: ${query}`);
        const regex = new RegExp(query, 'i'); // Recherche insensible à la casse
        const results = await db.collection('games')
            .find({ name: { $regex: regex } })
            .limit(10)
            .toArray();

        res.status(200).json(results);
    } catch (error) {
        console.error('Error during search:', error);
        res.status(500).json({ error: 'Erreur lors de la recherche.' });
    }
});


// Route pour récupérer un jeu spécifique par ID (GET)
app.get('/search/:id', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const { ObjectId } = require('mongodb');
        const gameId = req.params.id;
        console.log(`Fetching game with ID: ${gameId}`);
        
        const game = await db.collection('games').findOne({ _id: new ObjectId(gameId) });
        
        if (!game) {
            return res.status(404).json({ error: 'Jeu non trouvé' });
        }
        
        res.status(200).json(game);
    } catch (error) {
        console.error('Error fetching game:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération du jeu.' });
    }
});


// Route pour créer un nouveau jeu (POST)
app.post('/games', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const { name, developer, positive, negative } = req.body;
        
        // Validation
        if (!name || !developer || positive === undefined || negative === undefined) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }
        
        const newGame = {
            name,
            developer,
            positive: parseInt(positive, 10),
            negative: parseInt(negative, 10)
        };
        
        console.log('Creating new game:', newGame);
        const result = await db.collection('games').insertOne(newGame);
        
        res.status(201).json({ 
            message: 'Jeu créé avec succès', 
            gameId: result.insertedId,
            game: { _id: result.insertedId, ...newGame }
        });
    } catch (error) {
        console.error('Error creating game:', error);
        res.status(500).json({ error: 'Erreur lors de la création du jeu.' });
    }
});


// Route pour mettre à jour un jeu (PUT)
app.put('/games/:id', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const { ObjectId } = require('mongodb');
        const gameId = req.params.id;
        const { name, developer, positive, negative } = req.body;
        
        // Validation
        if (!name || !developer || positive === undefined || negative === undefined) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }
        
        const updatedGame = {
            name,
            developer,
            positive: parseInt(positive, 10),
            negative: parseInt(negative, 10)
        };
        
        console.log(`Updating game ${gameId}:`, updatedGame);
        const result = await db.collection('games').updateOne(
            { _id: new ObjectId(gameId) },
            { $set: updatedGame }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Jeu non trouvé' });
        }
        
        res.status(200).json({ 
            message: 'Jeu mis à jour avec succès',
            game: { _id: gameId, ...updatedGame }
        });
    } catch (error) {
        console.error('Error updating game:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du jeu.' });
    }
});


// Route pour supprimer un jeu (DELETE)
app.delete('/games/:id', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const { ObjectId } = require('mongodb');
        const gameId = req.params.id;
        
        console.log(`Deleting game ${gameId}`);
        const result = await db.collection('games').deleteOne({ _id: new ObjectId(gameId) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Jeu non trouvé' });
        }
        
        res.status(200).json({ message: 'Jeu supprimé avec succès' });
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression du jeu.' });
    }
}); 


// Recherche vectorielle (GET)
async function getQueryEmbedding(query) {
    try {
        const embeddingServiceUrl = 'http://localhost:5000/embed';

        const response = await fetch(embeddingServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: query })
        });

        if (!response.ok) {
            throw new Error(`Erreur d'embedding: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.embedding || !Array.isArray(data.embedding)) {
            throw new Error('Réponse d\'embedding invalide');
        }
        return data.embedding;
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'embedding de la requête:', error);
        throw error;
    }
}

app.get('/vector-search', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }

        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Paramètre de requête "q" requis' });
        }

        console.log(`Vector search for query: ${query}`);

        const queryEmbedding = await getQueryEmbedding(query);
        console.log(`Embedding received, length: ${queryEmbedding.length}`);

        const results = await db.collection('games').aggregate([
            {
                $vectorSearch: {
                    queryVector: queryEmbedding,
                    path: 'combined_embedding',
                    index: 'vector_index',
                    limit: 10,
                    numCandidates: 100
                }
            },
            { $project: { 
                _id: 1,
                name: 1,
                developer: 1,
                positive: 1,
                negative: 1,
                score: { $meta: 'vectorSearchScore' }
            } }
        ]).toArray();
        
        console.log(`Vector search returned ${results.length} results`);
        if (results.length > 0) {
            console.log(`First result: ${results[0].name}`);
        }
        
        res.status(200).json(results);
    } catch (error) {
        console.error('Error during vector search:', error);
        res.status(500).json({ error: 'Erreur lors de la recherche vectorielle.' });
    }
});

// Route pour les statistiques (GET)
app.get('/statistics', async (req, res) => {
    try {
        const variable = req.query.variable || 'positive';

        const pythonServiceUrl = 'http://localhost:5001/statistics';
        console.log(`Obtention des statistiques pour la variable: ${variable}`);

        const response = await fetch(pythonServiceUrl);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erreur du service Python:', errorText);
            return res.status(500).json({ error: 'Erreur lors de la récupération des statistiques.' });
        }

        const data = await response.json();
        console.log(`Statistics retrieved successfully for ${variable}`);
        res.status(200).json(data);
    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des statistiques.' });
    }
});