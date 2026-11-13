
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
  Share2,
  Facebook,
  FileText
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


type BulkProductRow = {
  rowNumber: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  stock_quantity: number;
  status: "ACTIVE" | "INACTIVE";
  image_url: string | null;
  error?: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
\nfunction makeSlug(value: string) {
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

  // Build a Facebook-ready caption that the merchant can paste into a post.
  function getProductAdvertCaption(product: Product) {
    const price =
      product.price === null
        ? "Contact us for price"
        : `₦${Number(product.price).toLocaleString("en-NG")}`;

    return [
      `🛍️ ${product.name}`,
      price,
      product.description || "",
      product.category ? `Category: ${product.category}` : "",
      "Order securely through WhatsApp:",
      getProductLink(product),
      "",
      "Powered by Sabi"
    ].filter(Boolean).join("\\n\\n");
  }

  async function copyProductAdvert(product: Product) {
    if (product.status !== "ACTIVE") {
      setError("Activate this product before marketing it.");
      return;
    }

    const caption = getProductAdvertCaption(product);

    try {
      await navigator.clipboard.writeText(caption);
      setSuccess(`Facebook advert caption for "${product.name}" copied. Paste it into your Facebook post.`);
      setError("");
    } catch {
      window.prompt("Copy this Facebook advert caption:", caption);
    }
  }

  function shareProductOnFacebook(product: Product) {
    if (product.status !== "ACTIVE") {
      setError("Activate this product before sharing its public link.");
      return;
    }

    const link = getProductLink(product);
    const facebookUrl =
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;

    window.open(facebookUrl, "_blank", "noopener,noreferrer");
    setSuccess("Facebook share window opened. Paste the copied advert caption into your post.");
    setError("");
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


  function downloadBulkTemplate() {
    const csv = [
      "name,description,category,price,stock_quantity,status,image_url"
    ].join("\\n");
    const blob = new Blob(["\\uFEFF", csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sabi-product-upload-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkFile(file?: File) {
    if (!file) return;
    setError("");
    setSuccess("");
    setBulkSummary("");
    setBulkRows([]);
    setBulkFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file. You can open the Sabi template in Excel and save it as CSV UTF-8.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("The CSV file must be 2 MB or smaller. Split larger catalogues into separate uploads.");
      return;
    }

    try {
      const raw = (await file.text()).replace(/^\\uFEFF/, "");
      const parsed = parseCsv(raw);
      if (parsed.length < 2) {
        setError("The CSV has no product rows. Add products below the header row and try again.");
        return;
      }

      const headers = parsed[0].map((value) => value.trim().toLowerCase());
      const column = (names: string[]) => headers.findIndex((header) => names.includes(header));
      const nameCol = column(["name", "product_name", "product name"]);
      const descriptionCol = column(["description"]);
      const categoryCol = column(["category"]);
      const priceCol = column(["price", "selling_price", "selling price"]);
      const stockCol = column(["stock_quantity", "stock", "quantity"]);
      const statusCol = column(["status"]);
      const imageCol = column(["image_url", "image url", "image"]);

      if (nameCol < 0 || priceCol < 0 || stockCol < 0) {
        setError("Required columns are name, price and stock_quantity. Download the Sabi template to get the correct headings.");
        return;
      }

      const existingNames = new Set(products.map((product) => product.name.trim().toLowerCase()));
      const seenNames = new Set<string>();
      const rows: BulkProductRow[] = parsed.slice(1).map((cells, index) => {
        const get = (col: number) => col < 0 ? "" : (cells[col] || "").trim();
        const name = get(nameCol);
        const priceText = get(priceCol).replace(/[₦,\\s]/g, "");
        const stockText = get(stockCol).replace(/[,\\s]/g, "");
        const price = Number(priceText);
        const stock = Number(stockText);
        const statusText = get(statusCol).toUpperCase();
        const imageUrl = get(imageCol);
        let rowError = "";

        if (!name) rowError = "Product name is required.";
        else if (!priceText || !Number.isFinite(price) || price < 0) rowError = "Enter a valid price.";
        else if (!stockText || !Number.isInteger(stock) || stock < 0) rowError = "Stock must be a whole number.";
        else if (statusText && statusText !== "ACTIVE" && statusText !== "INACTIVE") rowError = "Status must be ACTIVE or INACTIVE.";

        const normalizedName = name.toLowerCase();
        if (!rowError && existingNames.has(normalizedName)) rowError = "A product with this name already exists in your store.";
        if (!rowError && seenNames.has(normalizedName)) rowError = "This product name appears more than once in the upload.";
        if (!rowError && imageUrl) {
          try {
            const parsedUrl = new URL(imageUrl);
            if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
              rowError = "Image URL must start with http:// or https://.";
            }
          } catch {
            rowError = "Image URL is not valid.";
          }
        }
        if (!rowError && name) seenNames.add(normalizedName);

        return {
          rowNumber: index + 2,
          name,
          description: get(descriptionCol) || null,
          category: get(categoryCol) || null,
          price,
          stock_quantity: stock,
          status: statusText === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          image_url: imageUrl || null,
          error: rowError || undefined
        };
      });

      if (rows.length > 1000) {
        setError("A single upload can contain up to 1,000 products. Split this file into smaller batches.");
        return;
      }

      setBulkRows(rows);
    } catch {
      setError("We could not read this file. Please save it as CSV UTF-8 and try again.");
    }
  }

  async function importBulkProducts() {
    const validRows = bulkRows.filter((row) => !row.error);
    if (!validRows.length) {
      setError("There are no valid products to import. Correct the errors and upload the file again.");
      return;
    }

    setBulkImporting(true);
    setError("");
    setSuccess("");
    let imported = 0;
    let failed = 0;

    try {
      for (let start = 0; start < validRows.length; start += 50) {
        const batch = validRows.slice(start, start + 50).map((row) => ({
          name: row.name,
          slug: makeSlug(row.name),
          description: row.description,
          category: row.category,
          price: row.price,
          status: row.status,
          is_active: row.status === "ACTIVE",
          stock_quantity: row.stock_quantity,
          image_url: row.image_url,
          tenant_id: tenantId,
          updated_at: new Date().toISOString()
        }));

        const { error: insertError } = await supabase.from("products").insert(batch);
        if (insertError) {
          failed += batch.length;
        } else {
          imported += batch.length;
        }
      }

      await loadProducts();
      const invalid = bulkRows.length - validRows.length;
      setBulkSummary(`${imported} imported, ${invalid} skipped due to validation errors, ${failed} failed during database import.`);
      if (imported > 0) setSuccess(`Successfully imported ${imported} products.`);
      if (failed > 0) setError(`${failed} products could not be saved. Check your data and try those rows again.`);
      if (imported === validRows.length && invalid === 0) {
        setBulkRows([]);
        setBulkFileName("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed.");
    } finally {
      setBulkImporting(false);
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="product-refresh-btn" type="button" onClick={downloadBulkTemplate}>
            <FileText size={17} />
            Download CSV template
          </button>
          <button className="product-refresh-btn" type="button" onClick={() => bulkFileInput.current?.click()}>
            <Upload size={17} />
            Bulk upload
          </button>
          <input
            ref={bulkFileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              handleBulkFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <button className="product-primary-btn" onClick={openNewProduct}>
            <Plus size={18} />
            Add product
          </button>
        </div>
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

      {bulkRows.length > 0 && (
        <div className="products-list-panel" style={{ padding: 18, marginBottom: 18 }}>
          <div className="products-list-heading">
            <div>
              <h3>Bulk upload preview</h3>
              <p>{bulkFileName} · {bulkRows.length} rows · {bulkRows.filter((row) => !row.error).length} ready · {bulkRows.filter((row) => row.error).length} with errors</p>
            </div>
            <button className="product-refresh-btn" type="button" onClick={() => { setBulkRows([]); setBulkFileName(""); setBulkSummary(""); }} disabled={bulkImporting} aria-label="Clear bulk upload">
              <X size={17} />
            </button>
          </div>
          {bulkSummary && <div className="product-alert product-alert-success">{bulkSummary}</div>}
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="products-table">
              <thead><tr><th>CSV row</th><th>Product</th><th>Price</th><th>Stock</th><th>Validation</th></tr></thead>
              <tbody>
                {bulkRows.slice(0, 12).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.name || "—"}</td>
                    <td>₦{Number.isFinite(row.price) ? row.price.toLocaleString("en-NG") : "—"}</td>
                    <td>{Number.isFinite(row.stock_quantity) ? row.stock_quantity : "—"}</td>
                    <td style={{ color: row.error ? "#b42318" : "#067647", minWidth: 170 }}>
                      {row.error || "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bulkRows.length > 12 && <p style={{ fontSize: 13, color: "#667085" }}>Showing the first 12 rows. All {bulkRows.length} rows will be checked before import.</p>}
          <div className="product-modal-actions" style={{ marginTop: 16 }}>
            <button className="product-cancel-btn" type="button" onClick={() => { setBulkRows([]); setBulkFileName(""); }} disabled={bulkImporting}>Cancel</button>
            <button className="product-primary-btn" type="button" onClick={importBulkProducts} disabled={bulkImporting || bulkRows.every((row) => !!row.error)}>
              {bulkImporting ? "Importing..." : `Import ${bulkRows.filter((row) => !row.error).length} valid products`}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#667085", marginTop: 8 }}>CSV uploads only. To use Excel, open the template in Excel and save your completed file as CSV UTF-8 before uploading. Maximum 1,000 products per batch.</p>
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
                          title="Share product advert on WhatsApp"
                          aria-label={`Share ${product.name} on WhatsApp`}
                          disabled={product.status !== "ACTIVE"}
                        >
                          <Share2 size={17} />
                        </button>

                        <button
                          onClick={() => shareProductOnFacebook(product)}
                          title="Share product link on Facebook"
                          aria-label={`Share ${product.name} on Facebook`}
                          disabled={product.status !== "ACTIVE"}
                        >
                          <Facebook size={17} />
                        </button>

                        <button
                          onClick={() => copyProductAdvert(product)}
                          title="Copy Facebook advert caption"
                          aria-label={`Copy advert caption for ${product.name}`}
                          disabled={product.status !== "ACTIVE"}
                        >
                          <FileText size={17} />
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
