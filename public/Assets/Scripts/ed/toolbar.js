// toolbar.js

// --- Helper Functions for Toolbar Buttons ---
function getCursorPosition() {
    return codeEditor.getCursor('start'); // CodeMirror cursor position
}

function insertTextAtCursor(text) {
    codeEditor.replaceSelection(text); // CodeMirror insert text
}

function surroundSelectedText(prefix, suffix) {
    const selection = codeEditor.getSelection();
    const replacement = prefix + selection + suffix;
    codeEditor.replaceSelection(replacement);
}

function applyLinePrefix(prefix) {
    const cursor = codeEditor.getCursor();
    const lineNumber = cursor.line;
    const lineStart = { line: lineNumber, ch: 0 };
    codeEditor.replaceRange(prefix, lineStart, lineStart);
}


document.addEventListener('DOMContentLoaded', function () {
    // --- Button Event Listeners ---
    document.getElementById('bold-button').addEventListener('click', () => {
        saveHistoryState();
        let selectionRange = codeEditor.getSelection(); // Get selected text
        let selectedText = selectionRange || "your text"; // use selection or default
        let textToInsert = `**${selectedText}**`;
        codeEditor.replaceSelection(textToInsert, "around"); // Replace selection and keep cursor around it
        codeEditor.focus(); // Refocus editor
        updatePreview();
        triggerAutoSave();
    });

    document.getElementById('italic-button').addEventListener('click', () => {
        saveHistoryState();
        let selectionRange = codeEditor.getSelection();
        let selectedText = selectionRange || "your text";
        let textToInsert = `*${selectedText}*`; // Corrected to * for italic
        codeEditor.replaceSelection(textToInsert, "around");
        codeEditor.focus();
        updatePreview();
        triggerAutoSave();
    });

    document.getElementById('heading1-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('# ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('heading2-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('## ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('heading3-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('### ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('ul-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('- ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('ol-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('1. ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('quote-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('> ');
        updatePreview();
        codeEditor.focus();
        triggerAutoSave();
    });

    document.getElementById('code-button').addEventListener('click', () => {
        saveHistoryState();
        insertTextAtCursor('``'); // Backticks for inline code
        codeEditor.focus();
        codeEditor.setCursor(getCursorPosition().line, getCursorPosition().ch - 1); // Move cursor back one position
        updatePreview();
        triggerAutoSave();
    });

    document.getElementById('link-button').addEventListener('click', () => {
        linkDialog.style.display = 'block';
        linkUrlInput.value = '';
        linkTextInput.value = '';
        linkUrlInput.focus();
    });

    document.getElementById('image-button').addEventListener('click', () => {
        imageDialog.style.display = 'block';
        imageUrlInput.value = '';
        imageAltTextInput.value = '';
        imageUrlInput.focus();
    });

});