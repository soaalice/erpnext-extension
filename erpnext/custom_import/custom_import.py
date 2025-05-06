from collections import defaultdict
import frappe
import csv
import os
import io
from frappe.utils import cstr, cint, getdate, now_datetime
from frappe import _
from frappe.utils.file_manager import get_file

@frappe.whitelist()
def import_csv(file_url):
    try:
        file_path = frappe.get_site_path('private', 'files', os.path.basename(file_url))
        print("File path:", file_path)
        
        if not os.path.exists(file_path):
            frappe.throw(_("File not found"))
            
        with open(file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            
            frappe.db.begin()
            
            for row in csv_reader:
                if not validate_row(row):
                    continue
                    
                process_row(row)
                
            frappe.db.commit()
            
        os.remove(file_path)
        print("File deleted:", file_path)
        # frappe.delete_doc("File", {"file_url": file_url})
        file_doc = frappe.get_all("File", filters={"file_url": file_url}, fields=["name"])
        if file_doc:
            frappe.delete_doc("File", file_doc[0].name)
        print("File document deleted from Frappe:", file_url)

            
        return {"status": "success"}
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("CSV Import Error"))
        frappe.throw(_("Error during import: {0}").format(str(e)))

def validate_row(row):
    """
    Validation des données d'une ligne
    Retourne True si valide, False sinon
    """
    required_fields = ['id', 'test']
    
    for field in required_fields:
        if not row.get(field):
            frappe.msgprint(_("Missing required field: {0}").format(field))
            return False
    
    return True

def process_row(row):
    """
    Traitement d'une ligne de données
    """
    print("Processing row:", row)
    print("Row processed successfully")

@frappe.whitelist()
def process_multi_import(supplier_csv, rfq_csv, rfq_supplier_csv):
    try:
        frappe.db.begin()

        supplier_content = get_csv_content(supplier_csv)
        validate_supplier_csv(supplier_content)
        suppliers = create_suppliers(supplier_content)

        rfq_content = get_csv_content(rfq_csv)
        validate_rfq_csv(rfq_content)
        mrs = create_material_request(rfq_content)

        rfq_supplier_content = get_csv_content(rfq_supplier_csv)
        validate_rfq_supplier_csv(rfq_supplier_content)
        rfqs = create_rfqs(mrs, rfq_supplier_content)
        sqs = create_supplier_quotations(rfqs, rfq_supplier_content)

        frappe.db.commit()
        return {
            "message": "Import completed successfully",
            "suppliers_created": len(suppliers),
            "material_requests_created": len(mrs),
            "rfqs_created": len(rfqs),
            "supplier_quotations_created": len(sqs)
        }

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), _("Multi Import Failed"))
        frappe.throw(_("Import Failed: {0}").format(str(e)))

def validate_supplier_csv(data):
    required_fields = ['supplier_name', 'country', 'type']
    for row in data:
        for field in required_fields:
            if not row.get(field):
                frappe.throw(_("Missing required field '{0}' in Supplier CSV").format(field))

def validate_rfq_csv(data):
    required_fields = ['date', 'item_name', 'item_groupe', 'required_by', 
                      'quantity', 'purpose', 'target_warehouse', 'ref']
    for row in data:
        for field in required_fields:
            if not row.get(field):
                frappe.throw(_("Missing required field '{0}' in RFQ CSV").format(field))
            
        try:
            getdate(row["date"])
            getdate(row["required_by"])
        except:
            frappe.throw(_("Invalid date format in RFQ CSV"))

        try:
            float(row["quantity"])
        except:
            frappe.throw(_("Invalid quantity format in RFQ CSV"))
            
        create_item_group(row)
        create_item(row)
        create_target_warehouse(row)

def validate_rfq_supplier_csv(data):
    required_fields = ['ref_request_quotation', 'supplier']
    for row in data:
        for field in required_fields:
            if not row.get(field):
                frappe.throw(_("Missing required field '{0}' in RFQ Supplier CSV").format(field))

def get_csv_content(file_id):
    try:
        file_data = get_file(file_id)
        content = file_data[1]
        
        if isinstance(content, bytes):
            content = content.decode('utf-8-sig')
        
        return list(csv.DictReader(io.StringIO(content)))
    except Exception as e:
        frappe.log_error(f"CSV reading error - file_id: {file_id}, error: {str(e)}")
        frappe.throw(_("Error reading CSV file: {0}").format(str(e)))

def create_suppliers(data):
    created_suppliers = []
    for row in data:
        if not frappe.db.exists("Supplier", {"supplier_name": row["supplier_name"]}):
            try:
                supplier = frappe.get_doc({
                    "doctype": "Supplier",
                    "supplier_name": row["supplier_name"],
                    "country": row["country"],
                    "supplier_type": row["type"]
                })
                supplier.insert()
                created_suppliers.append(supplier.name)
            except Exception as e:
                frappe.throw(_("Error creating supplier {0}: {1}").format(
                    row["supplier_name"], str(e)))
    return created_suppliers

def create_item_group(row):
    row["item_groupe"] = row["item_groupe"].capitalize()
    if not frappe.db.exists("Item Group", {"item_group_name": row["item_groupe"]}):
        try:  
            item_group = frappe.get_doc({
                "doctype": "Item Group",
                "item_group_name": row["item_groupe"],
                "old_parent": "All Item Groups",
                "parent_item_group": "All Item Groups"
            })
            item_group.insert()
        except Exception as e:
            frappe.throw(_("Error creating item group {0}: {1}").format(row["item_groupe"], str(e)))
            
def create_item(row):
    if not frappe.db.exists("Item", {"item_code": row["item_name"]}):
        try:
            item = frappe.get_doc({
                "doctype": "Item",
                "item_code": row["item_name"],
                "item_group": row["item_groupe"],
                "stock_uom": "Nos",
                "is_stock_item": 1
            })
            item.insert()
        except Exception as e:
            frappe.throw(_("Error creating item {0}: {1}").format(row["item_name"], str(e)))
            
def create_target_warehouse(row):
    if row["target_warehouse"].lower() == "all warehouse":
        row["target_warehouse"] = "Tous les entrepôts"
    
    if not frappe.db.exists("Warehouse", {"warehouse_name": row["target_warehouse"]}):
        try:
            warehouse = frappe.get_doc({
                "doctype": "Warehouse",
                "warehouse_name": row["target_warehouse"]
            })
            warehouse.insert()
        except Exception as e:
            frappe.throw(_("Error creating warehouse {0}: {1}").format(row["target_warehouse"], str(e)))
            
def create_material_request(data):
    created_material_requests = []
    for row in data:
        try:
            material_request = frappe.get_doc({
                "doctype": "Material Request",
                "material_request_type": row["purpose"],
                "transaction_date": getdate(row["date"]),
                "schedule_date": getdate(row["required_by"]),
                "ref": row["ref"]
            })

            material_request.append("items", {
                "item_code": row["item_name"],
                "qty": float(row["quantity"]),
                "warehouse": row["target_warehouse"] + " - A"
            })

            material_request.insert()
            material_request.submit()
            created_material_requests.append(material_request)
        except Exception as e:
            frappe.throw(_("Error creating Material Request for reference {0}: {1}").format(row["ref"], str(e)))

    return created_material_requests
        

from erpnext.stock.doctype.material_request.material_request import make_request_for_quotation
def create_rfqs(material_requests, data):
    created_rfqs = []
    for mr in material_requests:
        print("Creating RFQ for Material Request:", mr)
        try:
            rfq = make_request_for_quotation(mr)
            rfq.message_for_supplier = "Default message for supplier"
            
            for row in data:
                if row["ref_request_quotation"] == mr.ref:
                    rfq.append("suppliers", {
                        "supplier": row["supplier"],
                    })
            rfq.ref = mr.ref        
            rfq.insert()
            rfq.submit()
            created_rfqs.append(rfq)
        except Exception as e:
            frappe.throw(_("Error creating RFQ for Material Request {0}: {1}").format(mr, str(e)))

    return created_rfqs

from erpnext.buying.doctype.request_for_quotation.request_for_quotation import make_supplier_quotation_from_rfq
def create_supplier_quotations(rfqs, data):
    created_quotations = []
    for rfq in rfqs:
        try:
            for row in data:
                if row["ref_request_quotation"] == rfq.ref:
                    quotation = make_supplier_quotation_from_rfq(rfq, for_supplier=row["supplier"])
                    quotation.insert()
                    created_quotations.append(quotation)

        except Exception as e:
            frappe.throw(_("Error creating Supplier Quotation for RFQ {0}: {1}").format(rfq.name, str(e)))

    return created_quotations
        