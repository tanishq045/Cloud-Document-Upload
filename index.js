// index.js
const express = require('express');
const path = require('path');
require('dotenv').config();
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const archiver = require('archiver');

const app = express();
const PORT = 8000;

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Set view engine
app.set('view engine', 'ejs');
app.set("views", path.resolve("./views"));

// Configure multer to store files in memory
const storage = multer.memoryStorage();
//const upload = multer({ storage: storage });
const upload = multer({
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Configure Google Cloud Storage
const gcs = new Storage({
    projectId: process.env.PROJECT_ID,
    keyFilename: process.env.KEYFILENAME
});

const bucketName = process.env.BUCKET_NAME;
console.log('Attempting to access bucket:', bucketName);
const bucket = gcs.bucket(bucketName);

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

app.post('/create-folder', async (req, res) => {
    const { folderName, currentFolder } = req.body;

    if (!folderName) {
        return res.status(400).send('Folder name is required.');
    }

    const folderPath = currentFolder
        ? `${currentFolder}/${folderName}/`
        : `${folderName}/`;

    try {
        // Create a placeholder file to ensure the folder exists
        const file = bucket.file(folderPath + '.placeholder');
        await file.save('');

        res.status(200).json({ message: 'Folder created successfully!' });
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Error creating folder' });
    }
});

app.post('/upload-file', upload.array('files'), async (req, res) => {
    const { currentFolder } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded or invalid file types' });
    }

    try {
        const uploadPromises = files.map(file => {
            const filePath = currentFolder
                ? `${currentFolder}/${file.originalname}`
                : file.originalname;

            const blob = bucket.file(filePath);
            const stream = blob.createWriteStream({
                metadata: {
                    contentType: 'application/pdf',
                },
            });

            return new Promise((resolve, reject) => {
                stream.on('error', reject);
                stream.on('finish', resolve);
                stream.end(file.buffer);
            });
        });

        await Promise.all(uploadPromises);
        res.status(200).json({ message: 'Files uploaded successfully!' });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({ error: 'Error uploading files' });
    }
});

app.post('/upload-folder', upload.array('files'), async (req, res) => {
    const { currentFolder, paths, folderName } = req.body;
    const files = req.files;
    const filePaths = Array.isArray(paths) ? paths : [paths];

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No PDF files found' });
    }

    try {
        const uploadPromises = files.map((file, index) => {
            const relativePath = filePaths[index];
            const filePath = currentFolder
                ? `${currentFolder}/${relativePath}`
                : relativePath;

            const blob = bucket.file(filePath);
            const stream = blob.createWriteStream({
                metadata: {
                    contentType: 'application/pdf',
                },
            });

            return new Promise((resolve, reject) => {
                stream.on('error', reject);
                stream.on('finish', resolve);
                stream.end(file.buffer);
            });
        });

        await Promise.all(uploadPromises);

        // Create a marker file to indicate this is a folder
        const folderMarkerPath = currentFolder
            ? `${currentFolder}/${folderName}/.folder`
            : `${folderName}/.folder`;
        const markerBlob = bucket.file(folderMarkerPath);
        await markerBlob.save('');

        res.status(200).json({ message: 'Folder uploaded successfully!' });
    } catch (error) {
        console.error('Error uploading folder:', error);
        res.status(500).json({ error: 'Error uploading folder' });
    }
});

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

app.get('/download-file', async (req, res) => {
    const { file } = req.query;

    if (!file) {
        return res.status(400).send('File parameter is required.');
    }

    try {
        const fileObj = bucket.file(file);
        const [exists] = await fileObj.exists();

        if (!exists) {
            return res.status(404).send('File not found');
        }

        // Force download by setting Content-Disposition
        const [metadata] = await fileObj.getMetadata();
        const fileName = path.basename(file);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Stream file directly
        const stream = fileObj.createReadStream();
        stream.pipe(res);

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send('Error downloading file');
    }
});

app.get('/download-folder', async (req, res) => {
    const { folder } = req.query;

    if (!folder) {
        return res.status(400).send('Folder parameter is required.');
    }

    try {
        const [files] = await bucket.getFiles({ prefix: folder });

        if (files.length === 0) {
            return res.status(404).send('Folder not found');
        }

        const archive = archiver('zip');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(folder)}.zip"`);

        archive.pipe(res);

        for (const file of files) {
            // Skip directory markers or empty placeholder files
            if (file.name.endsWith('/') || file.name.includes('.placeholder')) continue;

            const fileStream = file.createReadStream();
            archive.append(fileStream, {
                name: file.name.replace(folder, '').replace(/^\//, '')
            });
        }

        archive.finalize();

    } catch (error) {
        console.error('Error downloading folder:', error);
        res.status(500).send('Error downloading folder');
    }
});

app.post('/rename', async (req, res) => {
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName) {
        return res.status(400).json({ error: 'Old path and new name are required' });
    }

    try {
        // Determine if it's a file or folder
        const [files] = await bucket.getFiles({ prefix: oldPath });

        if (files.length === 0) {
            return res.status(404).json({ error: 'File or folder not found' });
        }

        // Determine the new path
        const pathParts = oldPath.split('/');
        pathParts[pathParts.length - 1] = newName;
        const newPath = pathParts.join('/');

        // Move all files with the old prefix to the new prefix
        const movePromises = files.map(async (file) => {
            const newFileName = file.name.replace(oldPath, newPath);
            await bucket.file(file.name).move(newFileName);
        });

        await Promise.all(movePromises);

        res.status(200).json({ message: 'Renamed successfully', newPath });
    } catch (error) {
        console.error('Error renaming:', error);
        res.status(500).json({ error: 'Error renaming file or folder' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});