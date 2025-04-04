// dialogs.js

// Dialog Elements
const linkDialog = document.getElementById('link-dialog');
const imageDialog = document.getElementById('image-dialog');
const linkUrlInput = document.getElementById('link-url');
const linkTextInput = document.getElementById('link-text');
const imageUrlInput = document.getElementById('image-url');
const imageAltTextInput = document.getElementById('image-alt-text');
const linkInsertButton = document.getElementById('link-insert-button');
const linkCancelButton = document.getElementById('link-cancel-button');
const imageInsertButton = document.getElementById('image-insert-button');
const imageCancelButton = document.getElementById('image-cancel-button');


document.addEventListener('DOMContentLoaded', function () {

    // --- Event listeners for dialog buttons ---
    linkInsertButton.addEventListener('click', () => {
        const url = linkUrlInput.value;
        const linkText = linkTextInput.value;
        if (url) {
            saveHistoryState();
            const markdownLink = linkText ? `[${linkText}](${url})` : `<${url}>`;
            insertTextAtCursor(markdownLink);
            updatePreview();
            codeEditor.focus();
            triggerAutoSave();
        }
        linkDialog.style.display = 'none';
    });

    linkCancelButton.addEventListener('click', () => {
        linkDialog.style.display = 'none';
        codeEditor.focus();
    });

    imageInsertButton.addEventListener('click', () => {
        const imageUrl = imageUrlInput.value;
        const altText = imageAltTextInput.value;
        if (imageUrl) {
            saveHistoryState();
            const markdownImage = `![${altText}](${imageUrl})`;
            insertTextAtCursor(markdownImage);
            updatePreview();
            codeEditor.focus();
            triggerAutoSave();
        }
        imageDialog.style.display = 'none';
    });

    imageCancelButton.addEventListener('click', () => {
        imageDialog.style.display = 'none';
        codeEditor.focus();
    });

});