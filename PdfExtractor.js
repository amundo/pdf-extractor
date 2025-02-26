// PDF Extractor Web Component
class PdfExtractor extends HTMLElement {
  constructor() {
    super();

    this.innerHTML = `
      <style>
        :host { 
          display: block;
          font-family: system-ui, -apple-system, sans-serif;
          margin: 20px 0;
        }
        .container {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 20px;
          max-width: 800px;
        }
        .controls {
          margin-bottom: 15px;
        }
        button {
          background-color: #4285f4;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-left: 10px;
        }
        button:hover {
          background-color: #3367d6;
        }
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        .output {
          white-space: pre-wrap;
          border: 1px solid #ddd;
          padding: 15px;
          background-color: #f8f9fa;
          max-height: 400px;
          overflow-y: auto;
          margin-top: 15px;
        }
        .status {
          margin-top: 10px;
          font-style: italic;
          color: #666;
        }
        .save-button {
          background-color: #34a853;
          margin-top: 15px;
          display: none;
        }
        .save-button:hover {
          background-color: #2e7d32;
        }
      </style>
      <div class="container">
        <div class="controls">
          <input type="file" accept=".pdf" id="pdf-input">
          <button id="extract-btn">Extract Text</button>
        </div>
        <div class="status" id="status"></div>
        <div class="output" id="output"></div>
        <button id="save-btn" class="save-button">Save Extracted Text</button>
      </div>
    `;
    
    this.extractedText = '';
    this.fileName = '';
    
    // Add the PDF.js script dynamically
    this._loadPDFJS();
    this._bindEvents();
  }
  
  connectedCallback() {
    // Component is now in the DOM
  }
  
  _loadPDFJS() {
    // Create script elements for PDF.js library and worker
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    
    script.onload = () => {
      // Set the worker source when the library is loaded
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      
      // Enable the extract button once library is loaded
      const extractBtn = this.querySelector('#extract-btn');
      extractBtn.disabled = false;
      
      this.querySelector('#status').textContent = 'PDF.js loaded successfully';
    };
    
    script.onerror = () => {
      this.querySelector('#status').textContent = 'Failed to load PDF.js library';
      console.error('Failed to load PDF.js');
    };
    
    // Add script to document
    document.head.appendChild(script);
    
    // Disable the extract button until the library is loaded
    this.querySelector('#extract-btn').disabled = true;
    this.querySelector('#status').textContent = 'Loading PDF.js library...';
  }
  
  _bindEvents() {
    const extractButton = this.querySelector('#extract-btn');
    extractButton.addEventListener('click', () => this._extractText());
    
    const saveButton = this.querySelector('#save-btn');
    saveButton.addEventListener('click', () => this._saveExtractedText());
  }
  
  async _extractText() {
    const fileInput = this.querySelector('#pdf-input');
    const outputDiv = this.querySelector('#output');
    const statusDiv = this.querySelector('#status');
    const saveButton = this.querySelector('#save-btn');
    
    if (!fileInput.files || fileInput.files.length === 0) {
      statusDiv.textContent = 'Please select a PDF file first.';
      return;
    }
    
    if (!window.pdfjsLib) {
      statusDiv.textContent = 'PDF.js library not loaded yet. Please try again in a moment.';
      return;
    }
    
    statusDiv.textContent = 'Extracting text...';
    outputDiv.textContent = '';
    saveButton.style.display = 'none';
    
    const file = fileInput.files[0];
    this.fileName = file.name.replace('.pdf', '') || 'extracted-text';
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      statusDiv.textContent = `Processing PDF with ${pdf.numPages} pages...`;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        statusDiv.textContent = `Extracting text from page ${i} of ${pdf.numPages}...`;
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract text with position information
        let lastY = null;
        let pageText = '';
        
        // Sort items by their y-position (top to bottom), then x-position (left to right)
        const sortedItems = textContent.items.sort((a, b) => {
          if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
            // If y positions are very close, sort by x position
            return a.transform[4] - b.transform[4];
          }
          // Otherwise sort by y position (reversed because PDF coords start from bottom)
          return b.transform[5] - a.transform[5];
        });
        
        // Process each text item
        for (const item of sortedItems) {
          const y = Math.round(item.transform[5]);
          
          // Check if we're on a new line (with some tolerance for slight variations)
          if (lastY !== null && Math.abs(y - lastY) > 5) {
            pageText += '\n';
          } else if (lastY !== null && pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
            // Add space between words on the same line
            pageText += ' ';
          }
          
          pageText += item.str;
          lastY = y;
        }
        
        fullText += `Page ${i}:\n${pageText}\n\n`;
      }
      
      this.extractedText = fullText;
      outputDiv.textContent = fullText;
      statusDiv.textContent = `Text extraction complete. Extracted ${pdf.numPages} pages.`;
      saveButton.style.display = 'inline-block';
      
      // Dispatch event with the extracted text
      this.dispatchEvent(new CustomEvent('textextracted', { 
        detail: { text: fullText, filename: file.name },
        bubbles: true 
      }));
    } catch (error) {
      outputDiv.textContent = '';
      statusDiv.textContent = `Error extracting text: ${error.message}`;
      console.error('PDF extraction error:', error);
    }
  }
  
  _saveExtractedText() {
    if (!this.extractedText) return;
    
    // Create a blob with the text
    const blob = new Blob([this.extractedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create a download link and trigger it
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.fileName}.txt`;
    a.click();
    
    // Clean up
    URL.revokeObjectURL(url);
  }
}

// Register the custom element
customElements.define('pdf-extractor', PdfExtractor);