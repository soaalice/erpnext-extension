import frappe
import json

@frappe.whitelist()
def reset_buying_module():
    if not frappe.session.user == "Administrator":
        frappe.throw("Seul l'administrateur peut effectuer cette action.")

    doctype_list = [
        "Supplier",
        "Item",
        "Item Price",
        "Item Supplier",
        "Material Request",
        "Material Request Item",
        "Request for Quotation",
        "Request for Quotation Item",
        "Request for Quotation Supplier",
        "Supplier Quotation",
        "Supplier Quotation Item",
        "Purchase Order",
        "Purchase Order Item",
        "Purchase Invoice",
        "Purchase Invoice Item",
        "Purchase Invoice Advance",
        "Payment Entry",
        "Payment Entry Reference",
        "Payment Ledger Entry",
        "Stock Ledger Entry",
        "GL Entry"
    ]

    for doctype in doctype_list:
        frappe.db.sql(f"TRUNCATE TABLE `tab{doctype}`")
           
    return "Module Buying réinitialisé"

@frappe.whitelist()
def reset_doctypes(doctypes):
    if not frappe.session.user == "Administrator":
        frappe.throw("Seul l'administrateur peut effectuer cette action.")

    doctypes = frappe.parse_json(doctypes)
    for doctype in doctypes:
        frappe.db.sql(f"TRUNCATE TABLE `tab{doctype}`")
    return "Les Doctypes sélectionnés ont été réinitialisés."

@frappe.whitelist()
def get_doctypes_for_module(module):
    try:
        module_def = frappe.get_doc("Module Def", module)
        doctypes = [d.document_type for d in module_def.get("links", []) if d.link_type == "Doctype"]
        return doctypes
    except frappe.DoesNotExistError:
        return []
    
@frappe.whitelist()
def reset_doctype_data(doctype):
    """
    Reset all documents for a given DocType
    """
    if not doctype:
        frappe.throw(("Please specify a DocType"))

    # Vérifier les permissions
    if not frappe.has_permission(doctype, "write"):
        frappe.throw(("You don't have permission to reset {0}").format(doctype), frappe.PermissionError)

    frappe.db.sql(f"TRUNCATE TABLE `tab{doctype}`")

    return {
        "message": ("Successfully reset {0} documents for {1}").format(0, doctype),
        "count": 0
    }

@frappe.whitelist()
def reset_multiple_doctypes(doctypes):
    """
    Reset documents for multiple DocTypes
    """
    if isinstance(doctypes, str):
        doctypes = frappe.parse_json(doctypes)

    if not doctypes or not isinstance(doctypes, list):
        frappe.throw(("Please specify a list of DocTypes"))

    results = {}
    for doctype in doctypes:
        try:
            result = reset_doctype_data(doctype)
            results[doctype] = result
        except Exception as e:
            results[doctype] = {
                "error": str(e),
                "success": False
            }
            frappe.log_error(f"Failed to reset {doctype}: {str(e)}")

    return results
