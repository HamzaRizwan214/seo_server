-- SEO Order Management System Database Schema
-- PostgreSQL Database

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS deliverables CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- Create ENUM types
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('paypal', 'stripe', 'bank_transfer');

-- Service categories table
CREATE TABLE service_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Services table (main service offerings)
CREATE TABLE services (
    id VARCHAR(50) PRIMARY KEY,
    category_id VARCHAR(50) REFERENCES service_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_description TEXT,
    description TEXT,
    features JSONB, -- Array of features
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service tiers table (pricing tiers for each service)
CREATE TABLE service_tiers (
    id VARCHAR(50) PRIMARY KEY,
    service_id VARCHAR(50) REFERENCES services(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    delivery_days INTEGER NOT NULL,
    features JSONB, -- Array of tier-specific features
    is_popular BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    website VARCHAR(500) NOT NULL,
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    service_tier_id VARCHAR(50) REFERENCES service_tiers(id),
    service_name VARCHAR(255) NOT NULL, -- Denormalized for history
    service_tier_name VARCHAR(255) NOT NULL, -- Denormalized for history
    service_price DECIMAL(10,2) NOT NULL,
    delivery_days INTEGER NOT NULL, -- Denormalized for history
    keywords TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_amount DECIMAL(10,2) NOT NULL,
    status order_status DEFAULT 'pending',
    payment_status payment_status DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    payment_id VARCHAR(255), -- PayPal transaction ID
    payer_id VARCHAR(255), -- PayPal payer ID
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    gateway_response JSONB, -- Store full gateway response
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order status history table
CREATE TABLE order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    status order_status NOT NULL,
    notes TEXT,
    changed_by INTEGER, -- Admin user ID (nullable for system changes)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deliverables table
CREATE TABLE deliverables (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by INTEGER, -- Admin user ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin users table
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_orders_tracking_id ON orders(tracking_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_service_tier_id ON orders(service_tier_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_payment_id ON payments(payment_id);
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX idx_deliverables_order_id ON deliverables(order_id);
CREATE INDEX idx_services_category_id ON services(category_id);
CREATE INDEX idx_service_tiers_service_id ON service_tiers(service_id);
CREATE INDEX idx_service_tiers_price ON service_tiers(price);

-- Insert service categories
INSERT INTO service_categories (id, name, description, icon) VALUES
('monthly-packages', 'Monthly SEO Packages', 'SEO packages help boost traffic, visibility, and attract the right customers.', 'search'),
('pbn-backlinks', 'PBN Backlinks', 'High-quality PBN backlink services tailored to help you overcome common marketing challenges.', 'link'),
('guest-posts', 'Guest Posts', 'Guest post services designed to tackle common marketing challenges your business may face.', 'file-text'),
('id-pbn-posts', 'Id PBN Posts', 'PBN post services designed to address common marketing challenges your business may encounter.', 'settings'),
('sidebar-pbn-backlinks', 'Sidebar PBN Backlinks', 'Sidebar PBN backlink services designed to help you overcome common marketing challenges.', 'link'),
('weekly-package', 'Weekly Package', 'Weekly package services designed to help you overcome common marketing challenges.', 'calendar');

-- Insert services
INSERT INTO services (id, category_id, name, short_description, description, features) VALUES
('monthly-seo-packages', 'monthly-packages', 'Monthly SEO Packages', 'SEO optimization packages crafted to address common marketing challenges your business may face.', 'Our SEO optimization packages are crafted to address common marketing challenges your business may face. Whether you''re struggling with slow traffic, attracting the wrong customers, or finding that your competition is more visible to your target audience, we have the right solution for you.', '["WEB 2.0 creation", "Guest/PBN posts", "Niche directory submission", "Blog post/article submission", "Image sharing", "Profile links", "Bookmark submission", "High DA blog comments"]'),

('pbn-backlinks-service', 'pbn-backlinks', 'PBN Backlinks Services', 'PBN post services tailored to help you overcome common marketing challenges.', 'Our PBN post services are tailored to help you overcome common marketing challenges your business may face. Whether you''re struggling with low traffic, attracting the wrong audience, or losing ground to competitors, we have the ideal solution to boost your online presence.', '["DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]'),

('guest-posts-service', 'guest-posts', 'Guest Post Services', 'Guest post services designed to tackle common marketing challenges.', 'Our guest post services are designed to tackle common marketing challenges your business may face. Whether you''re struggling with slow traffic, attracting the wrong customers, or finding that your competition is more visible to your target audience, we have the right solution for you.', '["Guest post writing", "Keyword/post suggested", "Maximum keywords", "Same industry post", "10+ domain authority", "Manual work", "Detailed report", "SERP tracking"]'),

('id-pbn-posts-service', 'id-pbn-posts', 'Id PBN Post Services', 'PBN post services designed to address common marketing challenges.', 'Our PBN post services are designed to address common marketing challenges your business may encounter. Whether you''re facing slow traffic, attracting the wrong audience, or losing visibility to competitors, we have the right solution for you.', '["DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted", "Blog comments"]'),

('sidebar-pbn-backlinks-service', 'sidebar-pbn-backlinks', 'Sidebar PBN Backlinks Services', 'Sidebar PBN backlink services designed to help you overcome marketing challenges.', 'Our sidebar PBN backlink services are designed to help you overcome common marketing challenges your business may face. Whether you''re struggling with low traffic, attracting the wrong audience, or losing ground to competitors, we have the ideal solution to boost your online presence.', '["Premium backlinks", "Links on real websites", "UK & US writing team", "Do-follow contextual link", "Posts live within 1 weeks", "Custom anchor text", "Vetted for quality & power", "No duplicate links"]'),

('weekly-package-service', 'weekly-package', 'Weekly Package Services', 'Weekly package services designed to help you overcome marketing challenges.', 'Our weekly package services are designed to help you overcome common marketing challenges your business may face. Whether you''re struggling with low traffic, attracting the wrong audience, or losing ground to competitors, we have the ideal solution to boost your online presence.', '["WEB 2.0 creation", "Article submission", "Profile backlinks", "Social bookmarking", "Niche blog comments", "PDF submission", "Image sharing", "Video sharing", "Blogger post", "WIX post", "WordPress post"]');

-- Insert service tiers
INSERT INTO service_tiers (id, service_id, name, price, delivery_days, features, is_popular) VALUES
-- Monthly SEO Packages Tiers
('monthly-seo-basic', 'monthly-seo-packages', 'Basic Monthly', 200.00, 30, '["01 WEB 2.0", "01 Guest/PBN Post", "01 Niche Directory Submission", "01 Blog Post/Article Submission", "01 Image Sharing", "01 Profile Links", "01 Bookmark Submission", "01 High DA Blog Comment", "01 WEB 2.0 PBNs", "200 Blog Comment (On Every Friday - Last 6 Days Work)"]', false),
('monthly-seo-standard', 'monthly-seo-packages', 'Standard Monthly', 450.00, 30, '["02 WEB 2.0", "02 Guest/PBN Post", "02 Niche Directory Submission", "02 Blog Post/Article Submission", "02 Image Sharing", "02 Profile Links", "02 Bookmark Submission", "02 High DA Blog Comment", "01 WEB 2.0 PBNs", "01 DOC/PDF Sharing", "01 Classified Add", "10 Blog Post/Article Submission", "10 Bookmark Submission", "300 Blog Comment (On Every Friday - Last 6 Days Work)"]', true),
('monthly-seo-premium', 'monthly-seo-packages', 'Premium Monthly', 800.00, 30, '["02 WEB 2.0", "03 Guest/PBN Post", "02 Niche Directory Submission", "02 Blog Post/Article Submission", "02 Image Sharing", "02 Profile Links", "02 Bookmark Submission", "02 High DA Blog Comment", "02 WEB 2.0 PBNs", "02 DOC/PDF Sharing", "02 Classified Add", "01 Google Map Citation", "05 Niche Blog Comments", "20 Blog Post/Article Submission", "20 Bookmark Submission", "20 Blog Comment", "500 Blog Comment (On Every Friday - Last 6 Days Work)"]', false),

-- PBN Backlinks Tiers
('pbn-basic', 'pbn-backlinks-service', 'Basic', 100.00, 7, '["50 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', false),
('pbn-standard', 'pbn-backlinks-service', 'Standard', 200.00, 7, '["100 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', true),
('pbn-premium', 'pbn-backlinks-service', 'Premium', 1000.00, 7, '["500 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', false),
('pbn-silver', 'pbn-backlinks-service', 'Silver', 2000.00, 14, '["1000 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', false),
('pbn-platinum', 'pbn-backlinks-service', 'Platinum', 4000.00, 21, '["2000 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', false),
('pbn-deluxe', 'pbn-backlinks-service', 'Deluxe', 6000.00, 30, '["3000 PBNs Blog Post", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted"]', false),

-- Guest Posts Tiers
('guest-bronze-gb-1', 'guest-posts-service', 'Bronze GB-1', 25.00, 7, '["1 Unique Guest Post", "Guest Post Writing", "Keyword/Post Suggested", "Maximum Keywords", "Same Industry Post", "10+ Domain Authority", "Manual Work", "Detailed Report", "SERP Tracking"]', false),
('guest-silver-gb-5', 'guest-posts-service', 'Silver GB-5', 100.00, 10, '["5 Unique Guest Post", "Guest Post Writing", "Keyword/Post Suggested", "Maximum Keywords", "Same Industry Post", "10+ Domain Authority", "Manual Work", "Detailed Report", "SERP Tracking"]', true),
('guest-bronze-gb-10', 'guest-posts-service', 'Bronze GB-10', 180.00, 14, '["10 Unique Guest Post", "Guest Post Writing", "Keyword/Post Suggested", "Maximum Keywords", "Same Industry Post", "10+ Domain Authority", "Manual Work", "Detailed Report", "SERP Tracking"]', false),
('guest-silver-gb-20', 'guest-posts-service', 'Silver GB-20', 270.00, 21, '["20 Unique Guest Post", "Guest Post Writing", "Keyword/Post Suggested", "Maximum Keywords", "Same Industry Post", "10+ Domain Authority", "Manual Work", "Detailed Report", "SERP Tracking"]', false),

-- ID PBN Posts Tiers
('id-pbn-pro-silver', 'id-pbn-posts-service', 'Pro Silver', 70.00, 7, '["10 ID PBNs", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted", "100 Blog Comments"]', false),
('id-pbn-pro-platinum', 'id-pbn-posts-service', 'Pro Platinum', 160.00, 10, '["30 ID PBNs", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted", "200 Blog Comments"]', true),
('id-pbn-pro-deluxe', 'id-pbn-posts-service', 'Pro Deluxe', 300.00, 14, '["60 ID PBNs", "DA up to 50+", "Do follow links", "Unique content", "Fast indexing", "All languages accepted", "Unique domains", "All niches accepted", "200 Blog Comments"]', false),

-- Sidebar PBN Backlinks Tiers
('sidebar-pbn-basic', 'sidebar-pbn-backlinks-service', 'Basic', 150.00, 7, '["25 Premium Backlinks", "Links on real websites", "UK & US writing team", "Do-follow contextual link", "Posts live within 1 weeks", "Custom anchor text", "Vetted for quality & power", "No duplicate links"]', false),
('sidebar-pbn-booster', 'sidebar-pbn-backlinks-service', 'Booster', 300.00, 7, '["50 Premium Backlinks", "Links on real websites", "UK & US writing team", "Do-follow contextual link", "Posts live within 1 weeks", "Custom anchor text", "Vetted for quality & power", "No duplicate links"]', true),
('sidebar-pbn-ranker', 'sidebar-pbn-backlinks-service', 'Ranker Package', 600.00, 7, '["100 Premium Backlinks", "Links on real websites", "UK & US writing team", "Do-follow contextual link", "Posts live within 1 weeks", "Custom anchor text", "Vetted for quality & power", "No duplicate links"]', false),

-- Weekly Package Tiers
('weekly-silver', 'weekly-package-service', 'Silver', 60.00, 7, '["8 WEB 2.0", "10 Article Submission", "20 Profile Backlinks", "20 Social Bookmarking", "15 Niche Blog Comments", "2 PDF Submission", "2 Image Sharing", "2 Video Sharing", "1 Blogger Post", "1 WIX Post", "20 Social Bookmarking for WEB 2.0", "50 DoFollow Backlinks for Profile Backlinks", "50 DoFollow Backlinks for Other Backlinks"]', false),
('weekly-gold', 'weekly-package-service', 'Gold', 90.00, 7, '["15 WEB 2.0", "20 Article Submission", "35 Profile Backlinks", "35 Social Bookmarking", "30 Niche Blog Comments", "3 PDF Submission", "3 Image Sharing", "3 Video Sharing", "1 Blogger Post", "1 WIX Post", "1 WordPress Post", "30 Social Bookmarking for WEB 2.0", "70 DoFollow Backlinks for Profile Backlinks", "90 DoFollow Backlinks for Other Backlinks"]', true),
('weekly-platinum', 'weekly-package-service', 'Platinum', 140.00, 7, '["20 WEB 2.0", "30 Article Submission", "45 Profile Backlinks", "45 Social Bookmarking", "50 Niche Blog Comments", "4 PDF Submission", "5 Image Sharing", "5 Video Sharing", "1 Blogger Post", "1 WIX Post", "1 WordPress Post", "1 Mystrikingly Post", "50 Social Bookmarking for WEB 2.0", "100 DoFollow Backlinks for Profile Backlinks", "180 DoFollow Backlinks for Other Backlinks"]', false);

-- Function to generate tracking ID
CREATE OR REPLACE FUNCTION generate_tracking_id() RETURNS TEXT AS $$
BEGIN
    RETURN 'SEO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('orders_id_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate tracking ID
CREATE OR REPLACE FUNCTION set_tracking_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tracking_id IS NULL OR NEW.tracking_id = '' THEN
        NEW.tracking_id := generate_tracking_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_tracking_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_tracking_id();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically add status history when order status changes
CREATE OR REPLACE FUNCTION add_status_history() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_history (order_id, status, notes)
        VALUES (NEW.id, NEW.status, 'Status changed automatically');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_add_status_history
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION add_status_history();