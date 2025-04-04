document.addEventListener('DOMContentLoaded', function() {
    const dialog = document.getElementById('markdown-generator-window');
    const dialogHeader = document.getElementById('generator-window-header');

    if (!dialog || !dialogHeader) {
        console.error("Dialog or dialog header element not found.");
        return;
    }

    // --- Draggable Functionality ---
    let isDragging = false;
    let offsetX, offsetY;

    dialogHeader.addEventListener('mousedown', dragStart);
    dialogHeader.addEventListener('touchstart', dragStart); // Add touchstart for mobile
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd); // Add touchend for mobile
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('touchmove', dragMove); // Add touchmove for mobile

    function dragStart(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        offsetX = clientX - dialog.offsetLeft;
        offsetY = clientY - dialog.offsetTop;
        dialogHeader.style.cursor = 'grabbing'; // Change cursor while dragging
        if (e.cancelable) e.preventDefault(); // Prevent default touch behavior
    }

    function dragEnd() {
        isDragging = false;
        dialogHeader.style.cursor = 'grab'; // Revert cursor after dragging
    }

    function dragMove(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dialog.style.left = (clientX - offsetX) + 'px';
        dialog.style.top = (clientY - offsetY) + 'px';
        if (e.cancelable) e.preventDefault(); // Prevent default touch behavior
    }

    // --- Resizable Functionality ---
    let isResizing = false;
    let initialWidth, initialHeight, initialMouseX, initialMouseY;

    // Create resize handle element (dynamically add to dialog)
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    dialog.appendChild(resizeHandle);

    // CSS for resize handle (add to your <style> section in index.html or ed.css)
    const style = document.createElement('style');
    style.textContent = `
        .markdown-generator-dialog .resize-handle {
            position: absolute;
            right: 5px;
            bottom: 5px;
            width: 15px;
            height: 15px;
            background-color: rgba(0, 0, 0, 0.2);
            cursor: nwse-resize;
            border-radius: 50%;
            z-index: 1001;
        }
        .markdown-generator-dialog .resize-handle:hover {
            background-color: rgba(0, 0, 0, 0.4);
        }
    `;
    document.head.appendChild(style);

    resizeHandle.addEventListener('mousedown', resizeStart);
    resizeHandle.addEventListener('touchstart', resizeStart); // Add touchstart for mobile
    document.addEventListener('mouseup', resizeEnd);
    document.addEventListener('touchend', resizeEnd); // Add touchend for mobile
    document.addEventListener('mousemove', resize);
    document.addEventListener('touchmove', resize); // Add touchmove for mobile

    function resizeStart(e) {
        isResizing = true;
        initialWidth = dialog.offsetWidth;
        initialHeight = dialog.offsetHeight;
        initialMouseX = e.touches ? e.touches[0].clientX : e.clientX;
        initialMouseY = e.touches ? e.touches[0].clientY : e.clientY;
        if (e.cancelable) e.preventDefault(); // Prevent default touch behavior
    }

    function resizeEnd() {
        isResizing = false;
    }

    function resize(e) {
        if (!isResizing) return;
        const currentMouseX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentMouseY = e.touches ? e.touches[0].clientY : e.clientY;
        const width = initialWidth + (currentMouseX - initialMouseX);
        const height = initialHeight + (currentMouseY - initialMouseY);

        // Minimum size constraints (optional, adjust as needed)
        const minWidth = 200; // Minimum width
        const minHeight = 150; // Minimum height

        dialog.style.width = Math.max(width, minWidth) + 'px';
        dialog.style.height = Math.max(height, minHeight) + 'px';
        if (e.cancelable) e.preventDefault(); // Prevent default touch behavior
    }
});
