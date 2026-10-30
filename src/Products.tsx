
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  Package,
  Edit,
  Trash2,
  Upload,
  X,
  RefreshCw,
  Image as ImageIcon,
  Copy,
  Share2
} from "lucide-react";
import { supabase } from "./lib/supabase";

type Product = {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price: number | null;
  status: "ACTIVE" | "INACTIVE";
  image_url: string | null;
  stock_quantity: number;
  created_at: string;
};

type ProductForm = {
  name: string;
  description: string;
  category: string;
  price: string;
  stock_quantity: string;
  status: "ACTIVE" | "INACTIVE";
};

const emptyForm: ProductForm = {
  name: "",
  description: "",
  category: "",
  price: "",
  stock_quantity: "0",
  status: "ACTIVE"
};

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function Products({ tenantId }: { tenantId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  // Generate the public product URL.
  function getProductLink(product: Product) {
    return `${window.location.origin}/?product=${encodeURIComponent(product.id)}`;
  }

  // Copy the public product URL.
  async function copyProductLink(product: Product) {
    const link = getProductLink(product);

    try {
      await navigator.clipboard.writeText(link);
      setSuccess(`Product link for "${product.name}" copied.`);
      setError("");
    } catch {
      window.prompt("Copy this product link:", link);
    }
  }

  // Open WhatsApp with a prepared product advert.
  function shareProductOnWhatsApp(product: Product) {
    if (product.status !== "ACTIVE") {
      setError("Activate this product before sharing its public link.");
      return;
    }

    const link = getProductLink(product);

    const price =
      product.price === null
        ? "Contact us for price"
        : `₦${Number(product.price).toLocaleString("en-NG")}`;

    const message = [
      `Check out ${product.name}!`,
      `Price: ${price}`,
      product.description || "",
      `View product: ${link}`
    ]
      .filter(Boolean)
      .join("\n\n");

    const whatsappUrl =
      `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  async function loadProducts() {
    setLoading(true);
    setError("");

    const { data, error: queryError } = await supabase
      .from("products")
      .select(
        "id, tenant_id, name, slug, description, category, price, status, image_url, stock_quantity, created_at"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setProducts([]);
    } else {
      setProducts((data || []) as Product[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, [tenantId]);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function openNewProduct() {
    setEditingProduct(null);
    setForm(emptyForm);
    setSelectedImage(null);
    setImagePreview("");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || "",
      category: product.category || "",
      price: product.price === null ? "" : String(product.price),
      stock_quantity: String(product.stock_quantity ?? 0),
      status: product.status
    });
    setSelectedImage(null);
    setImagePreview(product.image_url || "");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingProduct(null);
    setSelectedImage(null);
    setImagePreview("");
    setForm(emptyForm);
  }

  function handleImageChange(file?: File) {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must not exceed 5 MB.");
      return;
    }

    setError("");
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function uploadImage(): Promise<string | null> {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    console.log("SABI UPLOAD SESSION:", {
      hasSession: !!session,
      userId: session?.user?.id,
      sessionError: sessionError?.message
    });

    if (!selectedImage) {
      return editingProduct?.image_url || null;
    }

    const extension =
      selectedImage.type === "image/png"
        ? "png"
        : selectedImage.type === "image/webp"
          ? "webp"
          : "jpg";

    const fileName = `${crypto.randomUUID()}.${extension}`;
    const filePath = `${tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("sabi-product-images")
      .upload(filePath, selectedImage, {
        contentType: selectedImage.type,
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from("sabi-product-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const name = form.name.trim();
    const price = Number(form.price);
    const stock = Number(form.stock_quantity);

    if (!name) {
      setError("Enter a product name.");
      return;
    }

    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      setError("Enter a valid selling price.");
      return;
    }

    if (
      form.stock_quantity.trim() === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setError("Enter a valid whole-number stock quantity.");
      return;
    }

    setSaving(true);

    try {
      const imageUrl = await uploadImage();

      const productData = {
        name,
        slug: makeSlug(name),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        price,
        status: form.status,
        is_active: form.status === "ACTIVE",
        stock_quantity: stock,
        image_url: imageUrl,
        tenant_id: tenantId,
        updated_at: new Date().toISOString()
      };

      if (editingProduct) {
        const { error: updateError } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
          .eq("tenant_id", tenantId);

        if (updateError) throw updateError;

        setSuccess("Product updated successfully.");
      } else {
        const { error: insertError } = await supabase
          .from("products")
          .insert(productData);

        if (insertError) throw insertError;

        setSuccess("Product added successfully.");
      }

      setModalOpen(false);
      setEditingProduct(null);
      setSelectedImage(null);
      setImagePreview("");
      setForm(emptyForm);

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `Delete "${product.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(product.id);
    setError("");
    setSuccess("");

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSuccess(`${product.name} was deleted.`);
      await loadProducts();
    }

    setDeletingId("");
  }

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();

    return (
      product.name.toLowerCase().includes(term) ||
      (product.category || "").toLowerCase().includes(term)
    );
  });

  const activeCount = products.filter(
    (product) => product.status === "ACTIVE"
  ).length;

  return (
    <div className="products-page">
      <div className="products-toolbar">
        <div>
          <h2>Product catalogue</h2>
          <p>Add and manage the products your customers can order.</p>
        </div>

        <button className="product-primary-btn" onClick={openNewProduct}>
          <Plus size={18} />
          Add product
        </button>
      </div>

      <div className="product-summary-grid">
        <div className="product-summary-card">
          <span>Total products</span>
          <strong>{products.length}</strong>
        </div>

        <div className="product-summary-card">
          <span>Active products</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="product-summary-card">
          <span>Out of stock</span>
          <strong>
            {products.filter((product) => product.stock_quantity === 0).length}
          </strong>
        </div>
      </div>

      {error && (
        <div className="product-alert product-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="product-alert product-alert-success">
          {success}
        </div>
      )}

      <div className="products-list-panel">
        <div className="products-list-heading">
          <div>
            <h3>Your products</h3>
            <p>{products.length} products in your workspace</p>
          </div>

          <button
            className="product-refresh-btn"
            onClick={loadProducts}
            disabled={loading}
            title="Refresh products"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="product-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products or categories..."
          />
        </div>

        {loading ? (
          <div className="products-empty">
            <RefreshCw size={25} />
            <p>Loading your products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="products-empty">
            <Package size={38} />
            <h3>{search ? "No matching products" : "No products yet"}</h3>
            <p>
              {search
                ? "Try another product name or category."
                : "Add your first product to start building your catalogue."}
            </p>

            {!search && (
              <button
                className="product-primary-btn"
                onClick={openNewProduct}
              >
                <Plus size={17} />
                Add your first product
              </button>
            )}
          </div>
        ) : (
          <div className="products-table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="product-name-cell">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                          />
                        ) : (
                          <div className="product-image-placeholder">
                            <ImageIcon size={21} />
                          </div>
                        )}

                        <div>
                          <strong>{product.name}</strong>
                          <small>{product.category || "Uncategorised"}</small>
                        </div>
                      </div>
                    </td>

                    <td className="product-price">
                      {product.price === null
                        ? "Not set"
                        : `₦${Number(product.price).toLocaleString("en-NG", {
                            minimumFractionDigits: 2
                          })}`}
                    </td>

                    <td>{product.stock_quantity}</td>

                    <td>
                      <span
                        className={`product-status ${
                          product.status === "ACTIVE"
                            ? "product-status-active"
                            : "product-status-inactive"
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>

                    <td>
                      <div className="product-actions">
                        <button
                          onClick={() => copyProductLink(product)}
                          title="Copy public product link"
                          aria-label={`Copy link for ${product.name}`}
                        >
                          <Copy size={17} />
                        </button>

                        <button
                          onClick={() => shareProductOnWhatsApp(product)}
                          title="Share on WhatsApp"
                          aria-label={`Share ${product.name} on WhatsApp`}
                          disabled={product.status !== "ACTIVE"}
                        >
                          <Share2 size={17} />
                        </button>

                        <button
                          onClick={() => openEditProduct(product)}
                          title="Edit product"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Edit size={17} />
                        </button>

                        <button
                          className="product-delete-btn"
                          onClick={() => deleteProduct(product)}
                          disabled={deletingId === product.id}
                          title="Delete product"
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="product-modal-overlay">
          <div className="product-modal">
            <div className="product-modal-heading">
              <div>
                <h2>{editingProduct ? "Edit product" : "Add a product"}</h2>
                <p>Enter the details customers will see.</p>
              </div>

              <button onClick={closeModal} disabled={saving} aria-label="Close">
                <X size={21} />
              </button>
            </div>

            <form onSubmit={saveProduct}>
              <label>Product name *</label>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Classic leather shoes"
                required
              />

              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Describe your product..."
                rows={3}
              />

              <label>Category</label>
              <input
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
                placeholder="e.g. Fashion"
              />

              <div className="product-form-row">
                <div>
                  <label>Selling price (₦) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      setForm({ ...form, price: event.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label>Stock quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_quantity}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        stock_quantity: event.target.value
                      })
                    }
                    required
                  />
                </div>
              </div>

              <label>Product status</label>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as "ACTIVE" | "INACTIVE"
                  })
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              <label>Product image</label>

              <div className="product-image-upload">
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" />
                ) : (
                  <div className="product-upload-placeholder">
                    <ImageIcon size={30} />
                    <span>No image selected</span>
                  </div>
                )}

                <div className="product-upload-controls">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={16} />
                    Choose image
                  </button>

                  <small>JPG, PNG or WebP · Maximum 5 MB</small>
                </div>

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(event) =>
                    handleImageChange(event.target.files?.[0])
                  }
                />
              </div>

              {error && (
                <div className="product-alert product-alert-error">
                  {error}
                </div>
              )}

              <div className="product-modal-actions">
                <button
                  type="button"
                  className="product-cancel-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="product-primary-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingProduct
                      ? "Save changes"
                      : "Create product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
