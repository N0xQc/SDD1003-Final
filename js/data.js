// data.js (Code de navigateur/Front-end)

// 1. [ AFFICHAGE ]
// Définir la fonction pour récupérer les données (global scope)
const fetchGames = async () => {
    try {
        // Appelle l'endpoint API Node.js/Express
        const response = await fetch('http://localhost:3000/games'); 
        // ... (reste du code fetchGames) ...
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }

        const games = await response.json(); 
        console.log('Données récupérées:', games); 

        populateTable(games);

    } catch (error) {
        console.error('Erreur lors de la récupération des jeux:', error);
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Erreur de connexion a l'API ( serveur Node.js non demarre ou CORS ).</td></tr>`;
    }
};

// Définir la fonction pour remplir la table (global scope)
const populateTable = (games) => {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = ''; 

    if (games.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Aucun jeu trouve dans la base de donnees.</td></tr>`;
        return;
    }

    // Trier les jeux par avis positifs (du plus élevé au plus bas)
    const sortedGames = [...games].sort((a, b) => {
        const aPositive = a.positive || 0;
        const bPositive = b.positive || 0;
        return bPositive - aPositive;
    });

    sortedGames.forEach((game, index) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${index + 1}</td> 
            <td>${game.name || 'N/A'}</td>
            <td>${game.developer || 'N/A'}</td>
            <td>${game.positive || 0}</td>
            <td>${game.negative || 0}</td>
            <td><button class="crud-btn edit-btn" data-id="${game._id}"><i class="fa-solid fa-pen"></i></button></td>
            <td><button class="crud-btn delete-btn" data-id="${game._id}"><i class="fa-solid fa-trash"></i></button></td>
        `;
        
        tableBody.appendChild(row);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    // Lancer la récupération des données au chargement de la page
    fetchGames();
});



// 2. [ RECHERCHE ]
// Recherche simple (GET)
async function searchGames(query) {
    try {
        const response = await fetch(`http://localhost:3000/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        return [];
    }
}
// Recherche Vectorielle (GET)
async function vectorSearchGames(query) {
    try {
        const response = await fetch(`http://localhost:3000/vector-search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }

        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Erreur lors de la recherche vectorielle:', error);
        return [];
    }
}

// Gérer le mode de recherche (simple vs vectorielle)
const searchModeToggle = document.getElementById('modeToggle');
searchModeToggle.addEventListener('change', () => {
    const isVectorSearch = searchModeToggle.checked;
    const searchInput = document.getElementById('searchInput');
    if (isVectorSearch) {
        searchInput.setAttribute('data-search-mode', 'vector');
        searchInput.placeholder = 'Recherche vectorielle...';
    } else {
        searchInput.setAttribute('data-search-mode', 'simple');
        searchInput.placeholder = 'Recherche simple...';
    }
});

// Remplir la table avec le résultat de la recherche
const populateTableSearch = (game) => {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>1</td>
        <td>${game.name || 'N/A'}</td>
        <td>${game.developer || 'N/A'}</td>
        <td>${game.positive || 0}</td>
        <td>${game.negative || 0}</td>
        <td><button class="crud-btn edit-btn" data-id="${game._id}"><i class="fa-solid fa-pen"></i></button></td>
        <td><button class="crud-btn delete-btn" data-id="${game._id}"><i class="fa-solid fa-trash"></i></button></td>`;
    tableBody.appendChild(row);
};

// Gérer l'autocomplétion et la recherche en temps réel
document.getElementById('searchInput').addEventListener('input', async (event) => {
    const query = event.target.value;
    if (query.length < 2) {
        document.getElementById('autocompleteList').style.visibility = 'collapse';
        return;
    }
    const searchMode = event.target.getAttribute('data-search-mode') || 'simple';
    if (searchMode === 'vector') {
        var results = await vectorSearchGames(query);
    } else {
        var results = await searchGames(query);
    }
    const autocompleteList = document.getElementById('autocompleteList');
    autocompleteList.style.visibility = results.length > 0 ? 'visible' : 'collapse';
    autocompleteList.innerHTML = '';
    results.forEach(game => {
        const item = document.createElement('a');
        
        item.textContent = game.name;
        autocompleteList.appendChild(item);
        item.addEventListener('click', (e) => {
            e.preventDefault();
            autocompleteList.style.visibility = 'collapse';
            document.getElementById('searchInput').value = '';
            populateTableSearch(game);
        });
    });
});



// 3. [ CRUD ]
// Changements de vue (Accueil, Création, édition)
const viewCreate = document.getElementById('viewCreate');
const createContainer = document.getElementById('creationContainer');
const viewHome = document.getElementById('viewHome');
const dataContainer = document.getElementById('homeContainer');
const editContainer = document.getElementById('editingContainer');
const editGameName = document.getElementById('editGameName');
const editGameDeveloper = document.getElementById('editGameDeveloper');
const editGamePositive = document.getElementById('editGamePositive');
const editGameNegative = document.getElementById('editGameNegative');
const viewStatistics = document.getElementById('viewStatistics');
const statisticsContainer = document.getElementById('statisticsContainer');

// Gérer les clics sur les boutons éditer et Supprimer
document.getElementById('tableBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    
    if (editBtn) {
        e.preventDefault();
        const gameId = editBtn.getAttribute('data-id');
        console.log('Edit game:', gameId);
        
        // Show edit container
        dataContainer.style.display = 'none';
        viewCreate.style.display = 'none';
        viewHome.style.display = 'block';
        createContainer.style.display = 'none';
        editContainer.style.display = 'flex';

        // Garder l'ID du jeu à éditer dans un attribut de données du formulaire
        editForm.setAttribute('data-game-id', gameId);

        // Charger les données du jeu à éditer
        fetch(`http://localhost:3000/search/${gameId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP! Statut: ${response.status}`);
                }
                return response.json();
            }
            ).then(game => {
                editGameName.value = game.name || '';
                editGameDeveloper.value = game.developer || '';
                editGamePositive.value = game.positive || 0;
                editGameNegative.value = game.negative || 0;
            })
            .catch(error => {
                console.error('Erreur lors de la récupération des données du jeu pour l\'édition:', error);
            });
    }
    
    if (deleteBtn) {
        e.preventDefault();
        const gameId = deleteBtn.getAttribute('data-id');
        console.log('Supprimer le jeu:', gameId);
        
        // Confirmer la suppression
        if (confirm('Êtes-vous sûr de vouloir supprimer ce jeu?')) {
            deleteGame(gameId);
        }
    }
});

// Supprimer un jeu (DELETE)
async function deleteGame(gameId) {
    try {
        const response = await fetch(`http://localhost:3000/games/${gameId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        
        // Rafraîchir la liste des jeux après la suppression
        location.reload();
    } catch (error) {
        console.error('Erreur de suppression:', error);
    }
}

// Gérer les changements de vue
viewCreate.addEventListener('click', () => {
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'flex';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
});
viewHome.addEventListener('click', () => {
    dataContainer.style.display = 'flex';
    viewCreate.style.display = 'block';
    viewHome.style.display = 'none';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
});
viewStatistics.addEventListener('click', () => {
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'flex';
    
    // Charger les statistiques par défaut (avis positifs)
    fetchStatistics('positive');
});

// Gérer la soumission des formulaires de création
const creationForm = document.getElementById('creationForm');
creationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('gameName').value;
    const developer = document.getElementById('gameDeveloper').value;
    const positive = parseInt(document.getElementById('gamePositive').value, 10);
    const negative = parseInt(document.getElementById('gameNegative').value, 10);
    const newGame = { name, developer, positive, negative };

    try {
        const response = await fetch('http://localhost:3000/games', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newGame)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Clear the form after successful submission
        creationForm.reset();

        // Optionally, refresh the game list or provide feedback to the user
        fetchGames();
    } catch (error) {
        console.error('Error creating game:', error);
    }
});

// Gérer la soumission du formulaire d'édition
const editForm = document.getElementById('editingForm');
editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const gameId = editForm.getAttribute('data-game-id');
    
    if (!gameId) {
        console.error('No game ID found for editing');
        return;
    }
    
    const name = document.getElementById('editGameName').value;
    const developer = document.getElementById('editGameDeveloper').value;
    const positive = parseInt(document.getElementById('editGamePositive').value, 10);
    const negative = parseInt(document.getElementById('editGameNegative').value, 10);
    const updatedGame = { name, developer, positive, negative };
    
    try {
        const response = await fetch(`http://localhost:3000/games/${gameId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedGame)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        console.log('Game updated successfully');
        
        // Nettoyer le formulaire et l'attribut de données
        editForm.reset();
        editForm.removeAttribute('data-game-id');
        
        // Retour à la vue principale
        dataContainer.style.display = 'flex';
        viewCreate.style.display = 'block';
        viewHome.style.display = 'none';
        createContainer.style.display = 'none';
        editContainer.style.display = 'none';
        
        // Rafraîchir la liste des jeux
        location.reload();
    } catch (error) {
        console.error('Error updating game:', error);
    }
});



// 4. [ ANALYSE STATISTIQUE ]
async function fetchStatistics(variable = 'positive') {
    try {
        const response = await fetch(`http://localhost:3000/statistics?variable=${variable}`);

        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();

        // Afficher le graphique avec les statistiques récupérées
        const graphElement = document.getElementById('statisticsGraph');
        if (graphElement) {
            graphElement.src = `data:image/png;base64,${data.image_base64}`;
        }

        // Interpréter les statistiques textuelles
        interpretStatistics(data.stats, variable);

    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
    }
}
function interpretStatistics(stats, variable) {
    const { mean, median, std_dev, min, max } = stats;
    const interpretationElement = document.getElementById('statisticsInterpretation');
    if (interpretationElement) {
        interpretationElement.innerHTML = `
            <p><strong>Interprétation des statistiques pour "${variable}":</strong></p>
            <ul>
                <li><strong>Moyenne</strong> (${mean.toFixed(2)}): La valeur moyenne des avis ${variable} pour les jeux.</li>
                <li><strong>Médiane</strong> (${median.toFixed(2)}): La valeur centrale des avis ${variable}, indiquant que la moitié des jeux ont plus et l'autre moitié moins d'avis ${variable}.</li>
                <li><strong>écart-type</strong> (${std_dev.toFixed(2)}): Mesure de la dispersion des avis ${variable} autour de la moyenne. Un écart-type élevé indique une grande variabilité.</li>
                <li><strong>Valeur minimale</strong> (${min}): Le jeu avec le moins d'avis ${variable}.</li>
                <li><strong>Valeur maximale</strong> (${max}): Le jeu avec le plus d'avis ${variable}.</li>
            </ul>
        `;
    }
}