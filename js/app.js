// Briefcase Storefront — Main Application
(function() {
  'use strict';

  // State
  let products = [];

  // DOM Elements
  const productGrid = document.getElementById('productGrid');

  // === Initialize ===
  document.addEventListener('DOMContentLoaded', async () => {
    await loadProducts();
    setupSmoothScroll();
  });

  // === Load Products ===
  async function loadProducts() {
    try {
      const response = await fetch('/products.json');
      if (!response.ok) throw new Error('Failed to load products');
      const data = await response.json();
      products = data.products;
      renderProducts();
    } catch (error) {
      console.error('Error loading products:', error);
      productGrid.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>Unable to load products right now. Please try again later.</p>
        </div>
      `;
    }
  }

  // === Render Products ===
  function renderProducts() {
    if (!products.length) {
      productGrid.innerHTML = `
        <div class="loading">
          <p>No products available yet. Check back soon!</p>
        </div>
      `;
      return;
    }

    productGrid.innerHTML = products.map(product => `
      <div class="product-card">
        ${product.preview ? `
        <div class="product-image-wrap">
          <img src="${escAttr(product.preview)}" alt="${escAttr(product.name)}" class="product-image" loading="lazy">
        </div>
        ` : ''}
        <div class="product-card-body">
          <div class="product-category">${escHtml(product.category)}</div>
          <h3 class="product-name">${escHtml(product.name)}</h3>
          <p class="product-tagline">${escHtml(product.tagline)}</p>
          <p class="product-description">${escHtml(product.description)}</p>
          <ul class="product-features">
            ${product.features.map(f => `<li>${escHtml(f)}</li>`).join('')}
          </ul>
          <div class="product-meta">
            <span>📦 ${escHtml(product.format)}</span>
            <span>🔗 ${escHtml(product.compatible)}</span>
          </div>
          <div class="product-footer">
            <div class="product-price">
              <span class="product-price-currency">$${product.price}</span>
            </div>
            <button class="btn btn-stripe" data-product-id="${escAttr(product.id)}">
              Buy Now — $${product.price}
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach click handlers to Buy buttons
    document.querySelectorAll('.btn-stripe').forEach(btn => {
      btn.addEventListener('click', handleBuyClick);
    });
  }

  // === Handle Buy Click ===
  async function handleBuyClick(event) {
    const btn = event.currentTarget;
    const productId = btn.dataset.productId;
    const product = products.find(p => p.id === productId);

    if (!product) {
      showToast('Product not found. Please try again.');
      return;
    }

    // Disable button to prevent double-clicks
    btn.disabled = true;
    btn.textContent = 'Redirecting to checkout...';

    try {
      // Always go through the server endpoint so it can create a proper
      // Stripe Checkout Session with the right success_url parameters
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Checkout failed');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Something went wrong. Please try again.');
      btn.disabled = false;
      btn.textContent = `Buy Now — $${product.price}`;
    }
  }

  // === Success Page (Download Handler) ===
  function handleSuccessPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('product');
    const sessionId = urlParams.get('session_id');

    if (!productId) return;

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const container = document.querySelector('.success-card');
    if (!container) return;

    // Update the success page with product info
    const productNameEl = document.getElementById('productName');
    const downloadLink = document.getElementById('downloadLink');

    if (productNameEl) {
      productNameEl.textContent = product.name;
    }

    if (downloadLink && product.file) {
      downloadLink.href = product.file;
    }
  }

  // === Smooth Scroll for Nav Links ===
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // === Toast Notification ===
  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // === Utility: Escape HTML ===
  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Utility: Escape for HTML attribute ===
  function escAttr(str) {
    return escHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Expose for success page
  window.handleSuccessPage = handleSuccessPage;

})();