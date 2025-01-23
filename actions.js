// actions.js
document.getElementById('new-folder').addEventListener('click', (e) => {
    e.preventDefault();
    openNewFolderModal();
});

function getCurrentFolderPath() {
    // Get all breadcrumb links except the first one (My Hive)
    const breadcrumbLinks = Array.from(document.querySelectorAll('.breadcrumb a')).slice(1);
    // Combine the folder names to create the current path
    return breadcrumbLinks.map(link => link.textContent).join('/');
}

function openNewFolderModal() {
    const modal = document.getElementById('newFolderModal');
    modal.style.display = 'block';
    modal.style.opacity = 1;
    modal.querySelector('.modal-content').style.transform = 'translateY(0)';
}

function closeModal() {
    const modal = document.getElementById('newFolderModal');
    modal.style.opacity = 0;
    modal.querySelector('.modal-content').style.transform = 'translateY(-50px)';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

async function confirmCreateFolder() {
    const folderName = document.getElementById('newFolderName').value;
    const currentFolder = getCurrentFolderPath();

    if (!folderName.trim()) {
        console.error('Folder name cannot be empty.');
        return;
    }

    try {
        const response = await fetch('/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderName, currentFolder })
        });

        const data = await response.json();

        if (response.ok) {
            closeModal();
            console.log('Folder created successfully.');
            window.location.reload();
        } else {
            console.error(data.error || 'Failed to create folder.');
        }
    } catch (error) {
        console.error('An error occurred while creating the folder:', error);
    }
}

document.getElementById('upload-file').addEventListener('click', async (e) => {
    e.preventDefault();
    const currentFolder = getCurrentFolderPath();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.multiple = true; // Enable multiple file selection

    fileInput.onchange = async () => {
        const files = Array.from(fileInput.files);
        if (!files.length) return;

        // Validate all files are PDFs
        if (!files.every(file => file.type.includes('pdf'))) {
            alert('Please select only PDF files');
            return;
        }

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        formData.append('currentFolder', currentFolder);

        try {
            const response = await fetch('/upload-file', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                console.log('Files uploaded successfully.');
                window.location.reload();
            } else {
                console.error(data.error || 'Failed to upload files.');
            }
        } catch (error) {
            console.error('An error occurred while uploading files:', error);
        }
    };

    fileInput.click();
});

document.getElementById('upload-folder').addEventListener('click', (e) => {
    e.preventDefault();
    const currentFolder = getCurrentFolderPath();
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;

    folderInput.onchange = async () => {
        const files = Array.from(folderInput.files);

        // Filter out non-PDF files
        const pdfFiles = files.filter(file => file.type.includes('pdf'));

        if (pdfFiles.length === 0) {
            alert('No PDF files found in the selected folder');
            return;
        }

        const formData = new FormData();
        pdfFiles.forEach((file) => {
            // Get folder path relative to the selected directory
            const pathParts = file.webkitRelativePath.split('/');
            const folderName = pathParts[0];
            const relativePath = pathParts.slice(1).join('/');

            // Append file with path that preserves folder structure
            formData.append('files', file);
            formData.append('paths', `${folderName}/${relativePath}`);
        });
        formData.append('currentFolder', currentFolder);
        formData.append('folderName', pdfFiles[0].webkitRelativePath.split('/')[0]);

        try {
            const response = await fetch('/upload-folder', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Folder upload failed:', errorData.error);
            } else {
                console.log('Folder uploaded successfully.');
                window.location.reload();
            }
        } catch (error) {
            console.error('Error during folder upload:', error);
        }
    };

    folderInput.click();
});
