// context-menu.js

// Custom Context Menu Elements
const customContextMenu = document.getElementById('custom-context-menu');
const contextCopy = document.getElementById('context-copy');
const contextCut = document.getElementById('context-cut');
const contextPaste = document.getElementById('context-paste');
const contextUndo = document.getElementById('context-undo');
const contextRedo = document.getElementById('context-redo');
const contextDelete = document.getElementById('context-delete');
const contextSelectAll = document.getElementById('context-select-all');
const contextAddressMenu = document.getElementById('context-address-menu'); // Context menu "Quick Links" item
const addressMenuDropdown = document.getElementById('address-menu-dropdown'); // Context menu dropdown




const contextFixMarkdown = document.getElementById('context-fix-markdown'); // Get the "fix markdown" context menu item
const contextMarkdownGenerator = document.getElementById('context-markdown-generator'); // Get the "Generator markdown" context menu item


const previewToggleButton = document.getElementById('preview-toggle-button');
const previewIcon = document.getElementById('preview-icon');
const previewArea = document.getElementById('preview-area');


document.addEventListener('DOMContentLoaded', function() {
    if (!previewToggleButton || !previewIcon || !previewArea) {
        console.error("One or more elements not found. Make sure you have elements with IDs 'preview-toggle-button', 'preview-icon', and 'preview-area' in your HTML.");
        return; // Exit if elements are missing to prevent errors
    }

    // Set initial state (you can customize this)
    let isPreviewVisible = false; // Initially hide the preview
    previewArea.style.display = 'none'; // Hide the preview element initially
    previewIcon.classList.remove('fa-eye'); // Ensure it starts with fa-eye if initially hidden
    previewIcon.classList.add('fa-eye-slash');

    previewToggleButton.addEventListener('click', function() {
        isPreviewVisible = !isPreviewVisible; // Toggle the visibility state

        if (isPreviewVisible) {
            previewArea.style.display = 'block'; // Or 'flex', 'grid' depending on your layout
            previewIcon.classList.remove('fa-eye-slash');
            previewIcon.classList.add('fa-eye');
        } else {
            previewArea.style.display = 'none';
            previewIcon.classList.remove('fa-ey');
            previewIcon.classList.add('fa-eye-slash');
        }
    });
});


document.addEventListener('DOMContentLoaded', function () {

    document.addEventListener('contextmenu', (event) => { // Attach to the whole document now
        event.preventDefault();
        customContextMenu.classList.add('show');

        const menuHeight = customContextMenu.offsetHeight;
        const viewportHeight = window.innerHeight;
        const mouseY = event.clientY;

        if (mouseY + menuHeight > viewportHeight) {
            customContextMenu.style.top = `${mouseY - menuHeight}px`;
        } else {
            customContextMenu.style.top = `${mouseY}px`;
        }
        customContextMenu.style.left = `${event.clientX}px`;
    });

    document.addEventListener('click', (event) => {
        if (!customContextMenu.contains(event.target)) {
            customContextMenu.classList.remove('show');
        }
    });

    contextCopy.addEventListener('click', () => {
        const selectedText = codeEditor.getSelection(); // Get selection from CodeMirror
        navigator.clipboard.writeText(selectedText).then(() => {

        }).catch(() => {

        });
        customContextMenu.classList.remove('show');
    });

    contextCut.addEventListener('click', () => {
        saveHistoryState();
        const selectedText = codeEditor.getSelection();
        codeEditor.replaceSelection(''); // Cut in CodeMirror
        navigator.clipboard.writeText(selectedText).then(() => {
            updatePreview();
        }).catch(err => {

        });
        customContextMenu.classList.remove('show');
    });


    contextPaste.addEventListener('click', async () => {
        saveHistoryState();
        try {
            const text = await navigator.clipboard.readText();
            codeEditor.replaceSelection(text); // Paste in CodeMirror
            updatePreview();
        } catch (err) {

        }
        customContextMenu.classList.remove('show');
    });

    contextUndo.addEventListener('click', () => {
        undo();
        customContextMenu.classList.remove('show');
        autoSave(isManualSave = false);
    });

    contextRedo.addEventListener('click', () => {
        redo();
        customContextMenu.classList.remove('show');
        autoSave(isManualSave = false);
    });


    contextSelectAll.addEventListener('click', () => {
        codeEditor.execCommand("selectAll"); // Select all in CodeMirror
        customContextMenu.classList.remove('show');
    });


    document.addEventListener('DOMContentLoaded', () => {
        const customContextMenu = document.getElementById('custom-context-menu');
        const contextFixMarkdown = document.getElementById('context-fix-markdown'); // Get the fix markdown item

        // ... your existing context menu code ...

        if (contextFixMarkdown) {
            contextFixMarkdown.addEventListener('click', () => {
                customContextMenu.classList.remove('show'); // Hide context menu
                fixMarkdownContent(); // Call the function to fix markdown (defined in editor.js)
            });
        }
    });

    if (contextFixMarkdown) { // Check if the "fix markdown" element exists
        contextFixMarkdown.addEventListener('click', () => {
            fixMarkdownDocument(); // Call the fixMarkdownDocument function
            customContextMenu.classList.remove('show'); // Hide context menu after click
        });
    } else {
        console.warn("contextFixMarkdown element not found. Fix Markdown functionality in context menu will not work.");
    }
    
    if (contextMarkdownGenerator) {
        contextMarkdownGenerator.addEventListener('click', () => {
            toggleGeneratorWindow();
            customContextMenu.classList.remove('show'); // Hide context menu
        });
    } else {
        console.warn("contextMarkdownGenerator element not found. Generator Markdown functionality in context menu will not work.");
    }
});