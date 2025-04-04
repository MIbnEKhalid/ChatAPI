// shortcuts.js



document.addEventListener('DOMContentLoaded', function () {
    const codeMirrorEditorDiv = document.getElementById('codemirror-editor'); // Get CodeMirror Container for event listener attachment

    // --- Shortcut Keys Implementation ---
    codeMirrorEditorDiv.addEventListener('keydown', function (event) { // Attach to CodeMirror container
        if (event.ctrlKey) {
            switch (event.key.toLowerCase()) {
                case 'b':
                    event.preventDefault();
                    document.getElementById('bold-button').click();
                    autoSave(isManualSave = false);
                    break;
                case 'i':
                    event.preventDefault();
                    document.getElementById('italic-button').click();
                    autoSave(isManualSave = false);
                    break;
                case 'c':
                    event.preventDefault();
                    contextCopy.click();
                    autoSave(isManualSave = false);
                    break;
                case 'x':
                    event.preventDefault();
                    contextCut.click();
                    autoSave(isManualSave = false);
                    break;
                case 'v':
                    event.preventDefault();
                    contextPaste.click();
                    autoSave(isManualSave = false);
                    break;
                case 'a':
                    event.preventDefault();
                    contextSelectAll.click();
                    autoSave(isManualSave = false);
                    break;
                case 's':
                    event.preventDefault();
                    autoSave(true);
                    autoSave(isManualSave = false);
                    break;
                case 'y': // Ctrl+Y for Redo
                    event.preventDefault();
                    redo();

                    break;
                case 'z':
                    event.preventDefault();
                    undo();
                    autoSave(isManualSave = false);
                    break;        
                case 'l': // Ctrl+L for Link - OPEN LINK DIALOG
                    event.preventDefault();
                    document.getElementById('link-button').click();
                    autoSave(isManualSave = false);
                    break;
                case 'g':
                    generateMarkdownContent();
                    autoSave(isManualSave = false);
                    break;
                case 'f':
                    fixMarkdownContent(); // Call the function to fix markdown (defined in editor.js)
                    autoSave(isManualSave = false);
                    break;

    
                    
            }
        }
    });
    
});
