export class DropZone {
    constructor(elementId, fileInputId, onFilesSelected) {
        this.element = document.getElementById(elementId);
        this.input = document.getElementById(fileInputId);
        this.onFilesSelected = onFilesSelected;

        this.init();
    }

    init() {
        // Click to upload
        this.element.addEventListener('click', () => {
            this.input.click();
        });

        this.input.addEventListener('change', (e) => {
            if (e.target.files.length) {
                this.onFilesSelected(Array.from(e.target.files));
                this.input.value = ''; // Reset
            }
        });

        // Drag and Drop
        this.element.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.element.classList.add('drag-over');
        });

        this.element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.element.classList.remove('drag-over');
        });

        this.element.addEventListener('drop', (e) => {
            e.preventDefault();
            this.element.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                // filter images
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                this.onFilesSelected(files);
            }
        });
    }
}
