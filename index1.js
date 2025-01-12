const path = require("path");
const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

const app = express();
const PORT = 8000;

// Debug environment variables
console.log('Environment Variables:');
console.log('PROJECT_ID:', process.env.PROJECT_ID);
console.log('KEYFILENAME:', process.env.KEYFILENAME);
console.log('BUCKET_NAME:', process.env.BUCKET_NAME);

if (!process.env.BUCKET_NAME) {
    throw new Error('BUCKET_NAME environment variable is not set');
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure multer to store files in memory instead of disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure Google Cloud Storage
const gcs = new Storage({
    projectId: process.env.PROJECT_ID,
    keyFilename: process.env.KEYFILENAME
});

// Store bucket in a variable after checking it exists
const bucketName = process.env.BUCKET_NAME;
console.log('Attempting to access bucket:', bucketName);
const bucket = gcs.bucket(bucketName);

// Rest of your code remains the same...

// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

app.get('/', (req, res) => {
    return res.render("homepage");
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        // Create a new blob in the bucket and upload the file data
        const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
        const blobStream = blob.createWriteStream({
            resumable: false,
            metadata: {
                contentType: req.file.mimetype
            }
        });

        blobStream.on('error', (err) => {
            console.error('Error uploading to GCS:', err);
            return res.status(500).send('Unable to upload to Google Cloud Storage.');
        });

        blobStream.on('finish', () => {
            // Get the public URL
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            console.log('File uploaded successfully:', publicUrl);
            return res.redirect('/');
        });

        blobStream.end(req.file.buffer);

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).send('An error occurred during upload');
    }
});

app.post('/create-folder', async (req, res) => {
    try {
        const folderName = req.body.folderName; // Folder name from the request

        if (!folderName || folderName.trim() === '') {
            return res.status(400).send('Folder name is required.');
        }

        // Ensure the folder name ends with a slash
        const folderPath = folderName.endsWith('/') ? folderName : `${folderName}/`;

        // Create an empty object to simulate the folder
        const file = bucket.file(folderPath);
        await file.save(''); // Save an empty file

        console.log(`Folder "${folderPath}" created successfully.`);

        // Redirect to homepage with a success message
        res.redirect(`/?message=Folder "${folderPath}" created successfully.`);
    } catch (error) {
        console.error('Error creating folder:', error);
        res.redirect(`/?error=An error occurred while creating the folder.`);
    }
});

app.listen(PORT, () => {
    console.log(`Server started at PORT:${PORT}`);
});