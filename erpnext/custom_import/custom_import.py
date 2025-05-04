import frappe
import csv
import os
from frappe.utils import cstr, cint
from frappe import _

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
    # doc = frappe.new_doc("Your DocType")
    # doc.field1 = row.get('field1')
    # doc.field2 = row.get('field2')
    # doc.insert()
    print("Processing row:", row)
    print("Row processed successfully")