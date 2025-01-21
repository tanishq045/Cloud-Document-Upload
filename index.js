// server.js
const express = require('express');
const path = require('path');
require('dotenv').config();
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');

const app = express();
const PORT = 8000;

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set("views", path.resolve("./views"));

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure Google Cloud Storage
const gcs = new Storage({
    projectId: process.env.PROJECT_ID,
    keyFilename: process.env.KEYFILENAME
});

const bucketName = process.env.BUCKET_NAME;
console.log('Attempting to access bucket:', bucketName);
const bucket = gcs.bucket(bucketName);

// Helper function to organize files and folders
async function getFilesAndFolders(prefix = '') {
    try {
        // Normalize the prefix to ensure proper folder structure
        const normalizedPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : '';

        // Fetch all files with the given prefix
        const [files] = await bucket.getFiles({ prefix: normalizedPrefix });

        const folders = new Set();
        const pdfFiles = [];

        for (const file of files) {
            // Skip the prefix itself
            if (file.name === normalizedPrefix) continue;

            // Get the relative path from the current prefix
            const relativePath = file.name.slice(normalizedPrefix.length);

            if (relativePath.includes('/')) {
                // This is a folder - get the first segment
                const folderName = relativePath.split('/')[0];
                if (folderName) folders.add(folderName);
            } else if (file.name.endsWith('.pdf')) {
                // This is a PDF file
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000
                });

                pdfFiles.push({
                    name: path.basename(file.name), // Only show the file name, not the full path
                    fullPath: file.name,
                    url: signedUrl
                });
            }
        }

        return {
            folders: Array.from(folders),
            pdfFiles: pdfFiles
        };
    } catch (error) {
        console.error('Error getting files and folders:', error);
        throw error;
    }
}

// Route for login page
app.get('/', (req, res) => {
    return res.render("login", { errorMessage: null });
});

// Route to handle login submission
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const mockUser = {
        email: 'admin@dochive.com',
        password: '1234'
    };

    if (email === mockUser.email && password === mockUser.password) {
        return res.redirect('/myhive');
    }
    res.render('login', { errorMessage: 'Invalid Email or Password' });
});

// Route for MyHive root
app.get('/myhive', async (req, res) => {
    try {
        const { folders, pdfFiles } = await getFilesAndFolders();
        res.render('myhive', {
            folders: folders,
            pdfFiles: pdfFiles,
            currentFolder: '',
            breadcrumbs: []
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('myhive', {
            folders: [],
            pdfFiles: [],
            currentFolder: '',
            breadcrumbs: [],
            errorMessage: 'Error fetching files from Google Cloud Storage'
        });
    }
});

// Route for MyHive nested folders
app.get('/myhive/*', async (req, res) => {
    try {
        const folderPath = req.params[0];
        const { folders, pdfFiles } = await getFilesAndFolders(folderPath);

        // Create breadcrumbs from the path
        const breadcrumbs = folderPath.split('/').filter(Boolean);

        res.render('myhive', {
            folders: folders,
            pdfFiles: pdfFiles,
            currentFolder: folderPath,
            breadcrumbs: breadcrumbs
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('myhive', {
            folders: [],
            pdfFiles: [],
            currentFolder: req.params[0],
            breadcrumbs: [],
            errorMessage: 'Error fetching files from Google Cloud Storage'
        });
    }
});

// Route to view PDF in DocHive
app.get('/view-pdf', async (req, res) => {
    const { file } = req.query;

    if (!file) {
        return res.status(400).send('File parameter is required.');
    }

    try {
        // Get the file from the bucket
        const [signedUrl] = await bucket.file(file).getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000 // 1 hour expiration
        });

        res.render('pdfviewer', { fileUrl: signedUrl, fileName: path.basename(file) });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).send('Error loading PDF');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});