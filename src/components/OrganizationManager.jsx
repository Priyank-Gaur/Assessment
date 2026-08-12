import React, { useState } from 'react';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon, 
  Close as CloseIcon, 
  Add as AddIcon, 
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Search as SearchIcon,
  FileUpload as FileUploadIcon,
  People as PeopleIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  VpnKey as VpnKeyIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { codeGenerationApi } from '../services/api';

const OrganizationManager = ({ 
  organizations = [], 
  addOrganization, 
  updateOrganization, 
  deleteOrganization,
  regenerateOnboardingCode,
  employees = [],
  loadEmployees,
  importEmployees,
  deleteEmployee
}) => {
  // Add Form State
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgStatus, setOrgStatus] = useState('active');

  const getDaysSinceOnboarded = (dateString) => {
    if (!dateString) return 0;
    const created = new Date(dateString);
    const now = new Date();
    created.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffTime = now - created;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Edit Modal State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('active');

  // View Details Modal State
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOrg, setViewingOrg] = useState(null);

  // Delete Confirmation Modal State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(null);

  // Employee Directory and Excel Import State
  const [activeTab, setActiveTab] = useState('details'); // 'details', 'employees', or 'codes'
  const [isImportMode, setIsImportMode] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');
  const [excelFile, setExcelFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [importSummary, setImportSummary] = useState(null);

  // Manual Add Employee State
  const [isManualAddMode, setIsManualAddMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualDept, setManualDept] = useState('');
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualDesignation, setManualDesignation] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualError, setManualError] = useState('');

  // Code Generation State
  const [generatedCodes, setGeneratedCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState('');
  const [codesSuccess, setCodesSuccess] = useState('');
  const [codeType, setCodeType] = useState('random'); // 'random' | 'custom'
  const [customCode, setCustomCode] = useState('');
  const [maxSignups, setMaxSignups] = useState(10);
  const [creatingCode, setCreatingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  // Code Generation Handlers
  const loadGeneratedCodes = async (orgId) => {
    setCodesLoading(true);
    setCodesError('');
    try {
      const data = await codeGenerationApi.getCodesByOrg(orgId);
      setGeneratedCodes(Array.isArray(data) ? data : []);
    } catch (err) {
      setCodesError(err.message || 'Failed to load codes.');
    } finally {
      setCodesLoading(false);
    }
  };

  const handleCreateCode = async (e) => {
    e.preventDefault();
    if (!viewingOrg) return;
    if (codeType === 'custom' && !customCode.trim()) {
      setCodesError('Please enter a custom code.');
      return;
    }
    if (!maxSignups || maxSignups < 1) {
      setCodesError('Max signups must be at least 1.');
      return;
    }
    setCreatingCode(true);
    setCodesError('');
    setCodesSuccess('');
    try {
      await codeGenerationApi.createCode(viewingOrg.id, {
        codeType,
        customCode: codeType === 'custom' ? customCode.trim().toUpperCase() : undefined,
        maxSignups: Number(maxSignups),
      });
      setCodesSuccess(`Code created successfully!`);
      setCustomCode('');
      setMaxSignups(10);
      setCodeType('random');
      await loadGeneratedCodes(viewingOrg.id);
    } catch (err) {
      setCodesError(err.message || 'Failed to create code.');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleToggleCodeStatus = async (code) => {
    const newStatus = code.status === 'active' ? 'inactive' : 'active';
    try {
      await codeGenerationApi.updateCodeStatus(viewingOrg.id, code.id, newStatus);
      setGeneratedCodes(prev => prev.map(c => c.id === code.id ? { ...c, status: newStatus } : c));
    } catch (err) {
      setCodesError(err.message || 'Failed to update code status.');
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Handlers
  const handleAddOrg = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) {
      alert('Organization name is required.');
      return;
    }
    
    try {
      await addOrganization({
        name: orgName.trim(),
        description: orgDescription.trim(),
        status: orgStatus
      });
      setOrgName('');
      setOrgDescription('');
      setOrgStatus('active');
    } catch (error) {
      console.error('Error adding organization:', error);
      alert(error.message || 'Failed to add organization.');
    }
  };

  const handleEditClick = (org) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditDescription(org.description || '');
    setEditStatus(org.status || 'active');
    setEditDialogOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      alert('Organization name is required.');
      return;
    }

    try {
      await updateOrganization(editingOrg.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        status: editStatus
      });
      setEditDialogOpen(false);
      setEditingOrg(null);
      setEditName('');
      setEditDescription('');
    } catch (error) {
      console.error('Error updating organization:', error);
      alert(error.message || 'Failed to update organization.');
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditingOrg(null);
    setEditName('');
    setEditDescription('');
  };

  const handleDeleteClick = (org) => {
    setDeletingOrg(org);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteOrganization(deletingOrg.id);
      setDeleteDialogOpen(false);
      setDeletingOrg(null);
    } catch (error) {
      console.error('Error deleting organization:', error);
      alert(error.message || 'Failed to delete organization.');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeletingOrg(null);
  };

  const handleToggleStatus = async (org) => {
    const nextStatus = org.status === 'active' ? 'inactive' : 'active';
    try {
      await updateOrganization(org.id, { status: nextStatus });
    } catch (error) {
      console.error('Error toggling organization status:', error);
      alert('Failed to change status.');
    }
  };

  const handleViewClick = async (org) => {
    setViewingOrg(org);
    setActiveTab('details');
    setIsImportMode(false);
    setIsManualAddMode(false);
    setPreviewRows([]);
    setImportSummary(null);
    setViewDialogOpen(true);
    setEmployeesLoading(true);
    try {
      await loadEmployees(org.id);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleViewClose = () => {
    setViewDialogOpen(false);
    setViewingOrg(null);
    setExcelFile(null);
    setPreviewRows([]);
    setImportSummary(null);
    setIsManualAddMode(false);
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExcelFile(file);
    setImportSummary(null);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert worksheet to JSON rows
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        if (rawRows.length === 0) {
          alert('Excel file is empty.');
          return;
        }

        // Get headers (all keys in parsed rows)
        const headers = Array.from(
          new Set(rawRows.reduce((acc, row) => acc.concat(Object.keys(row)), []))
        );

        // Identify Name and Email headers case-insensitively
        const nameHeader = headers.find(h => /name/i.test(h)) || 'Name';
        const emailHeader = headers.find(h => /email/i.test(h)) || 'Email';

        // Get existing employee emails for this organization to check duplicates
        const existingEmails = new Set(
          (employees || [])
            .filter(emp => emp.organization_id === viewingOrg.id)
            .map(emp => emp.email.toLowerCase())
        );

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const fileEmails = new Set();
        
        const validated = rawRows
          .map((row, idx) => {
            // Get original keys and filter out Name and Email headers
            const extraKeys = Object.keys(row).filter(
              k => k !== nameHeader && k !== emailHeader
            );
            
            // Build dynamic metadata object
            const metadata = {};
            extraKeys.forEach(k => {
              if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
                metadata[k] = row[k];
              }
            });

            const name = String(row[nameHeader] || '').trim();
            const email = String(row[emailHeader] || '').trim();

            // Ignore completely empty rows
            if (!name && !email && extraKeys.every(k => !row[k])) {
              return null;
            }

            const errors = [];
            
            // Validation: Name is mandatory
            if (!name) {
              errors.push('Missing Name');
            }
            
            // Validation: Email is mandatory
            if (!email) {
              errors.push('Missing Email');
            } else {
              // Validation: Email format check
              if (!emailRegex.test(email)) {
                errors.push('Invalid Email Format');
              } else {
                const lowerEmail = email.toLowerCase();
                
                // Validation: Duplicate inside file
                if (fileEmails.has(lowerEmail)) {
                  errors.push('Duplicate in file');
                } else {
                  fileEmails.add(lowerEmail);
                  
                  // Validation: Duplicate in organization
                  if (existingEmails.has(lowerEmail)) {
                    errors.push('Already exists in organization');
                  }
                }
              }
            }

            return {
              rowNumber: idx + 2, // Excel row index is 1-based header + 1-based data
              name,
              email,
              metadata,
              errors,
              isValid: errors.length === 0,
              originalRow: row
            };
          })
          .filter(Boolean); // Filter out ignored empty rows

        setPreviewRows(validated);
      } catch (err) {
        console.error('Error parsing Excel:', err);
        alert('Failed to parse Excel file. Please make sure it is a valid format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveImport = async () => {
    const validRows = previewRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('No valid records to import.');
      return;
    }

    try {
      setEmployeesLoading(true);
      const employeesToSave = validRows.map(r => ({
        name: r.name,
        email: r.email,
        metadata: r.metadata
      }));

      await importEmployees(viewingOrg.id, employeesToSave);
      
      // Calculate summary
      setImportSummary({
        total: previewRows.length,
        imported: validRows.length,
        failed: previewRows.length - validRows.length,
        errors: previewRows.map(r => r.errors).filter(e => e.length > 0).flat()
      });

      // Clear file upload input state and preview
      setPreviewRows([]);
      setExcelFile(null);
    } catch (err) {
      console.error('Import failed:', err);
      alert(err.message || 'Failed to save employees.');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleManualAddSubmit = async (e) => {
    e.preventDefault();
    setManualError('');

    const name = manualName.trim();
    const email = manualEmail.trim();

    if (!name) {
      setManualError('Name is required');
      return;
    }
    if (!email) {
      setManualError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setManualError('Invalid email format');
      return;
    }

    // Check duplicate in organization (client-side validation for responsiveness)
    const existingEmails = new Set(
      (employees || [])
        .filter(emp => emp.organization_id === viewingOrg.id)
        .map(emp => emp.email.toLowerCase())
    );
    if (existingEmails.has(email.toLowerCase())) {
      setManualError('Email already registered in this organization');
      return;
    }

    try {
      setEmployeesLoading(true);
      
      // Pack optional/custom fields into metadata dynamically
      const metadata = {};
      if (manualDept.trim()) metadata['Department'] = manualDept.trim();
      if (manualEmpId.trim()) metadata['Employee ID'] = manualEmpId.trim();
      if (manualDesignation.trim()) metadata['Designation'] = manualDesignation.trim();
      if (manualPhone.trim()) metadata['Phone'] = manualPhone.trim();
      if (manualLocation.trim()) metadata['Location'] = manualLocation.trim();

      await importEmployees(viewingOrg.id, [{ name, email, metadata }]);
      
      // Clear manual entry form states
      setManualName('');
      setManualEmail('');
      setManualDept('');
      setManualEmpId('');
      setManualDesignation('');
      setManualPhone('');
      setManualLocation('');
      setIsManualAddMode(false);
    } catch (err) {
      console.error('Failed to add employee manually:', err);
      setManualError(err.message || 'Failed to save employee.');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleDeleteEmployee = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete employee "${name}"?`)) {
      try {
        await deleteEmployee(id);
      } catch (err) {
        console.error('Failed to delete employee:', err);
        alert('Failed to delete employee.');
      }
    }
  };

  // Filtered List
  const filteredOrgs = organizations.filter(org => {
    const term = searchTerm.toLowerCase();
    return (
      org.name.toLowerCase().includes(term) ||
      (org.description || '').toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ width: '100%' }}>
      {/* Add Organization Form */}
      <div className="section-card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 className="section-card__header">Add New Organization</h3>
        <form onSubmit={handleAddOrg} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 3, minWidth: '200px', marginBottom: 0 }}>
              <label className="form-label">Organization Name *</label>
              <input
                type="text"
                className="form-input"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
              <label className="form-label">Initial Status</label>
              <select
                className="form-input"
                value={orgStatus}
                onChange={e => setOrgStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Description (Optional)</label>
            <textarea
              className="form-input"
              value={orgDescription}
              onChange={e => setOrgDescription(e.target.value)}
              placeholder="Provide a brief description of the company..."
              style={{ minHeight: '60px', resize: 'vertical', paddingTop: '8px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              className="btn btn--primary" 
              disabled={!orgName.trim()}
              style={{ height: '42px', padding: '0 var(--space-6)' }}
            >
              <AddIcon className="btn-icon" />
              Add Organization
            </button>
          </div>
        </form>
      </div>

      {/* Directory Section Header & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h3 className="section-card__header" style={{ marginBottom: 0 }}>
          Organizations ({filteredOrgs.length})
        </h3>
        
        {/* Search Bar */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <SearchIcon style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--color-muted-fg)', width: '20px', height: '20px' }} />
          <input
            type="text"
            className="form-input"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search organizations..."
            style={{ paddingLeft: '40px', height: '42px', marginBottom: 0 }}
          />
        </div>
      </div>
      
      {/* Organizations Directory */}
      {filteredOrgs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No organizations found</p>
          <p className="empty-state__subtitle">
            {searchTerm ? 'Try adjusting your search criteria.' : 'Create your first organization above.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filteredOrgs.map((org) => (
            <div key={org.id} className="list-item" style={{ alignItems: 'center' }}>
              <div className="list-item__content" style={{ flex: 1, minWidth: 0 }}>
                <div className="list-item__title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {org.name}
                </div>
                <div style={{ marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <span className={`badge badge--${org.status === 'active' ? 'success' : 'error'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {org.status === 'active' ? <CheckCircleIcon style={{ width: '12px', height: '12px' }} /> : <CancelIcon style={{ width: '12px', height: '12px' }} />}
                    {org.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                  {org.description && (
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                      {org.description}
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)' }} title={`Onboarded: ${new Date(org.created_at).toLocaleString()}`}>
                    Onboarded At: {new Date(org.created_at).toLocaleDateString()} ({getDaysSinceOnboarded(org.created_at)} days ago)
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'var(--space-4)' }}>
                <button 
                  className="btn btn--outline" 
                  onClick={() => handleViewClick(org)} 
                  style={{ padding: 'var(--space-2)', minWidth: 'auto' }}
                  title="View Details"
                >
                  <VisibilityIcon style={{ width: '20px', height: '20px' }} />
                </button>
                <button 
                  className="btn btn--outline" 
                  onClick={() => handleToggleStatus(org)} 
                  style={{ padding: 'var(--space-2)', minWidth: 'auto' }}
                  title={org.status === 'active' ? 'Deactivate' : 'Activate'}
                >
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '0 4px' }}>
                    {org.status === 'active' ? 'Disable' : 'Enable'}
                  </span>
                </button>
                <button 
                  className="btn btn--outline" 
                  onClick={() => handleEditClick(org)} 
                  style={{ padding: 'var(--space-2)', minWidth: 'auto' }}
                  title="Edit"
                >
                  <EditIcon style={{ width: '20px', height: '20px' }} />
                </button>
                <button 
                  className="btn btn--outline" 
                  onClick={() => handleDeleteClick(org)} 
                  style={{ padding: 'var(--space-2)', minWidth: 'auto', color: 'var(--color-destructive)', borderColor: 'var(--color-destructive)' }}
                  title="Delete"
                >
                  <DeleteIcon style={{ width: '20px', height: '20px' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Organization Modal */}
      {editDialogOpen && (
        <div className="overlay overlay--visible" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, background: 'rgba(0,0,0,0.6)' }}>
          <div className="auth-card" style={{ maxWidth: '500px', margin: 'var(--space-4)', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Edit Organization</h2>
              <button onClick={handleEditCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted-fg)' }}>
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={handleEditSave}>
              <div className="form-group">
                <label className="form-label">Organization Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  style={{ minHeight: '80px', resize: 'vertical', paddingTop: '8px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                <button type="button" className="btn btn--outline" onClick={handleEditCancel}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={!editName.trim()}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details / Manage Employees Modal */}
      {viewDialogOpen && viewingOrg && (
        <div className="overlay overlay--visible" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, background: 'rgba(0,0,0,0.6)', padding: 'var(--space-4)' }}>
          <div className="auth-card" style={{ maxWidth: activeTab === 'details' ? '600px' : '1000px', maxHeight: '88vh', overflowY: 'auto', margin: 0, width: '100%', transition: 'max-width 0.2s ease-in-out' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                {activeTab === 'employees' ? `Manage ${viewingOrg.name} Employees` : 'Organization Details'}
              </h2>
              <button onClick={handleViewClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted-fg)' }}>
                <CloseIcon />
              </button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-4)', gap: 'var(--space-4)' }}>
              <button 
                type="button"
                onClick={() => { setActiveTab('details'); setIsImportMode(false); setIsManualAddMode(false); }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--space-2) var(--space-1)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: activeTab === 'details' ? 'var(--color-fg)' : 'var(--color-muted-fg)',
                  cursor: 'pointer',
                  borderBottom: '2px solid transparent',
                  borderBottomColor: activeTab === 'details' ? 'var(--color-primary)' : 'transparent'
                }}
              >
                <InfoIcon style={{ width: '16px', height: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
                General Details
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('employees'); setIsImportMode(false); setIsManualAddMode(false); setImportSummary(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--space-2) var(--space-1)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: activeTab === 'employees' ? 'var(--color-fg)' : 'var(--color-muted-fg)',
                  cursor: 'pointer',
                  borderBottom: '2px solid transparent',
                  borderBottomColor: activeTab === 'employees' ? 'var(--color-primary)' : 'transparent'
                }}
              >
                <PeopleIcon style={{ width: '16px', height: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
                Employee Directory ({employees.filter(e => e.organization_id === viewingOrg.id).length})
              </button>
              <button 
                type="button"
                onClick={() => {
                  setActiveTab('codes');
                  setIsImportMode(false);
                  setIsManualAddMode(false);
                  setCodesError('');
                  setCodesSuccess('');
                  loadGeneratedCodes(viewingOrg.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--space-2) var(--space-1)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: activeTab === 'codes' ? 'var(--color-fg)' : 'var(--color-muted-fg)',
                  cursor: 'pointer',
                  borderBottom: '2px solid transparent',
                  borderBottomColor: activeTab === 'codes' ? 'var(--color-primary)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                <VpnKeyIcon style={{ width: '16px', height: '16px', marginRight: '6px', verticalAlign: 'middle' }} />
                Code Generation
              </button>
            </div>
            
            {activeTab === 'details' && (
              /* TAB 1: General Details */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Organization ID</label>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, background: 'var(--color-bg)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontFamily: 'monospace' }}>
                    {viewingOrg.id}
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Name</label>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{viewingOrg.name}</div>
                </div>



                <div>
                  <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Status</label>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`badge badge--${viewingOrg.status === 'active' ? 'success' : 'error'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {viewingOrg.status === 'active' ? <CheckCircleIcon style={{ width: '12px', height: '12px' }} /> : <CancelIcon style={{ width: '12px', height: '12px' }} />}
                      {viewingOrg.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Description</label>
                  <div style={{ fontSize: 'var(--text-sm)', color: viewingOrg.description ? 'inherit' : 'var(--color-muted-fg)', fontStyle: viewingOrg.description ? 'normal' : 'italic' }}>
                    {viewingOrg.description || 'No description provided.'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-6)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                  <div>
                    <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', marginBottom: '2px' }}>Onboarded At</label>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>
                      {new Date(viewingOrg.created_at).toLocaleDateString()} ({getDaysSinceOnboarded(viewingOrg.created_at)} days since onboarded)
                    </div>
                  </div>
                  <div>
                    <label className="form-label" style={{ color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', marginBottom: '2px' }}>Last Updated</label>
                    <div style={{ fontSize: 'var(--text-xs)' }}>
                      {new Date(viewingOrg.updated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'employees' && (
              /* TAB 2: Employees Directory & Excel Import */
              <div>
                {isManualAddMode ? (
                  /* MANUAL ADD INTERFACE */
                  <form onSubmit={handleManualAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <h4 style={{ fontWeight: 600, fontSize: 'var(--text-md)', margin: '0 0 var(--space-2) 0', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                      Add Employee Manually
                    </h4>

                    {manualError && (
                      <div style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-xs)', fontWeight: 600, padding: 'var(--space-2)', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-destructive)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <WarningIcon style={{ width: '14px', height: '14px' }} />
                        {manualError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                        <label className="form-label">Full Name *</label>
                        <input
                          type="text"
                          className="form-input"
                          value={manualName}
                          onChange={e => setManualName(e.target.value)}
                          placeholder="e.g. John Doe"
                          required
                          disabled={employeesLoading}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                        <label className="form-label">Email Address *</label>
                        <input
                          type="email"
                          className="form-input"
                          value={manualEmail}
                          onChange={e => setManualEmail(e.target.value)}
                          placeholder="e.g. john@example.com"
                          required
                          disabled={employeesLoading}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                        <label className="form-label">Department</label>
                        <input
                          type="text"
                          className="form-input"
                          value={manualDept}
                          onChange={e => setManualDept(e.target.value)}
                          placeholder="e.g. Engineering"
                          disabled={employeesLoading}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                        <label className="form-label">Employee ID</label>
                        <input
                          type="text"
                          className="form-input"
                          value={manualEmpId}
                          onChange={e => setManualEmpId(e.target.value)}
                          placeholder="e.g. EMP123"
                          disabled={employeesLoading}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                        <label className="form-label">Designation</label>
                        <input
                          type="text"
                          className="form-input"
                          value={manualDesignation}
                          onChange={e => setManualDesignation(e.target.value)}
                          placeholder="e.g. Software Engineer"
                          disabled={employeesLoading}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                        <label className="form-label">Phone Number</label>
                        <input
                          type="text"
                          className="form-input"
                          value={manualPhone}
                          onChange={e => setManualPhone(e.target.value)}
                          placeholder="e.g. +1 555-0199"
                          disabled={employeesLoading}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Location</label>
                      <input
                        type="text"
                        className="form-input"
                        value={manualLocation}
                        onChange={e => setManualLocation(e.target.value)}
                        placeholder="e.g. New York, USA"
                        disabled={employeesLoading}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                      <button 
                        type="button" 
                        className="btn btn--outline" 
                        onClick={() => setIsManualAddMode(false)}
                        disabled={employeesLoading}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="btn btn--primary"
                        disabled={employeesLoading || !manualName.trim() || !manualEmail.trim()}
                      >
                        {employeesLoading ? 'Adding...' : 'Add Employee'}
                      </button>
                    </div>
                  </form>
                ) : isImportMode ? (
                  /* IMPORT INTERFACE */
                  <div>
                    {importSummary ? (
                      /* SUCCESS IMPORT SUMMARY CARD */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <div style={{ padding: 'var(--space-4)', background: 'rgba(16,185,129,0.1)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)' }}>
                          <h4 style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircleIcon /> Import Completed
                          </h4>
                          <p style={{ fontSize: 'var(--text-sm)', margin: 0, lineHeight: 1.5 }}>
                            Successfully imported <strong>{importSummary.imported}</strong> valid records out of <strong>{importSummary.total}</strong> total rows.
                          </p>
                        </div>
                        
                        {importSummary.failed > 0 && (
                          <div style={{ padding: 'var(--space-4)', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-destructive)', borderRadius: 'var(--radius-md)' }}>
                            <h4 style={{ color: 'var(--color-destructive)', fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <CancelIcon /> Skipped Records ({importSummary.failed})
                            </h4>
                            <p style={{ fontSize: 'var(--text-xs)', margin: 0, lineHeight: 1.5, color: 'var(--color-muted-fg)' }}>
                              Skipped <strong>{importSummary.failed}</strong> row(s) containing validation errors (missing name/email, duplicates, or format conflicts).
                            </p>
                          </div>
                        )}
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                          <button 
                            type="button" 
                            className="btn btn--primary" 
                            onClick={() => { setImportSummary(null); setIsImportMode(false); }}
                          >
                            Back to Directory
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* EXCEL FILE UPLOAD & PREVIEW */
                      <div>
                        <div style={{ 
                          padding: 'var(--space-3) var(--space-4)', 
                          background: 'rgba(142, 102, 241, 0.05)', 
                          border: '1px dashed var(--color-primary)', 
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-fg)',
                          lineHeight: '1.4',
                          marginBottom: 'var(--space-4)'
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Important Note:</span> Name and Email are mandatory fields in the Excel sheet when importing employees for the organization.
                        </div>
                        {!excelFile ? (
                          /* UPLOAD DROP BOX */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div 
                              onClick={() => document.getElementById('employee-excel-input').click()}
                              style={{ 
                                border: '2px dashed var(--color-border)', 
                                padding: 'var(--space-8) var(--space-4)', 
                                borderRadius: 'var(--radius-md)', 
                                textAlign: 'center', 
                                cursor: 'pointer', 
                                background: 'var(--color-bg)',
                                transition: 'border-color 0.2s'
                              }}
                              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                            >
                              <FileUploadIcon style={{ width: '48px', height: '48px', color: 'var(--color-muted-fg)', marginBottom: 'var(--space-2)' }} />
                              <p style={{ fontWeight: 600, margin: '0 0 var(--space-1) 0' }}>Upload Employee spreadsheet</p>
                              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', margin: 0 }}>Supports .xlsx and .xls formats</p>
                              <input 
                                id="employee-excel-input" 
                                type="file" 
                                accept=".xlsx,.xls" 
                                hidden 
                                onChange={handleExcelUpload} 
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                              <button type="button" className="btn btn--outline" onClick={() => setIsImportMode(false)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* PREVIEW DATA GRID & SUMMARY */
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                              <div style={{ fontSize: 'var(--text-sm)' }}>
                                File: <strong>{excelFile.name}</strong> 
                                <span style={{ color: 'var(--color-muted-fg)', marginLeft: 'var(--space-3)' }}>
                                  ({previewRows.length} parsed rows)
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <span className="badge badge--success">
                                  Valid: {previewRows.filter(r => r.isValid).length}
                                </span>
                                <span className="badge badge--error">
                                  Errors: {previewRows.filter(r => !r.isValid).length}
                                </span>
                              </div>
                            </div>

                            {/* Preview Table Container */}
                            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                                <thead style={{ background: 'var(--color-bg)', position: 'sticky', top: 0, zIndex: 1, borderBottom: '1px solid var(--color-border)' }}>
                                  <tr>
                                    <th style={{ padding: '8px var(--space-2)', fontWeight: 600 }}>Row</th>
                                    <th style={{ padding: '8px var(--space-2)', fontWeight: 600 }}>Name</th>
                                    <th style={{ padding: '8px var(--space-2)', fontWeight: 600 }}>Email</th>
                                    <th style={{ padding: '8px var(--space-2)', fontWeight: 600 }}>Attributes</th>
                                    <th style={{ padding: '8px var(--space-2)', fontWeight: 600 }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewRows.map((row, idx) => (
                                    <tr 
                                      key={idx} 
                                      style={{ 
                                        borderBottom: '1px solid var(--color-border)', 
                                        backgroundColor: row.isValid ? 'transparent' : 'rgba(239,68,68,0.05)' 
                                      }}
                                    >
                                      <td style={{ padding: '8px var(--space-2)', color: 'var(--color-muted-fg)' }}>{row.rowNumber}</td>
                                      <td style={{ padding: '8px var(--space-2)', fontWeight: 500, color: row.name ? 'inherit' : 'var(--color-muted-fg)' }}>
                                        {row.name || '(Empty)'}
                                      </td>
                                      <td style={{ padding: '8px var(--space-2)', color: row.email ? 'inherit' : 'var(--color-muted-fg)' }}>
                                        {row.email || '(Empty)'}
                                      </td>
                                      <td style={{ padding: '8px var(--space-2)' }}>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                          {Object.entries(row.metadata).map(([k, v]) => (
                                            <span 
                                              key={k} 
                                              title={`${k}: ${v}`}
                                              style={{ 
                                                fontSize: '10px', 
                                                background: 'var(--color-bg)', 
                                                padding: '2px 6px', 
                                                borderRadius: '10px',
                                                border: '1px solid var(--color-border)',
                                                whiteSpace: 'nowrap',
                                                textOverflow: 'ellipsis',
                                                overflow: 'hidden',
                                                maxWidth: '120px'
                                              }}
                                            >
                                              {k}: {String(v)}
                                            </span>
                                          ))}
                                          {Object.keys(row.metadata).length === 0 && (
                                            <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic' }}>None</span>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ padding: '8px var(--space-2)', verticalAlign: 'middle' }}>
                                        {row.isValid ? (
                                          <span className="badge badge--success" style={{ padding: '2px 6px', fontSize: '10px' }}>Valid</span>
                                        ) : (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {row.errors.map((err, errIdx) => (
                                              <span 
                                                key={errIdx} 
                                                style={{ 
                                                  color: 'var(--color-destructive)', 
                                                  fontWeight: 600,
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '2px'
                                                }}
                                              >
                                                <WarningIcon style={{ width: '10px', height: '10px' }} />
                                                {err}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Import Controls */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <button 
                                type="button" 
                                className="btn btn--outline" 
                                onClick={() => { setExcelFile(null); setPreviewRows([]); }}
                              >
                                Re-upload file
                              </button>
                              
                              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                <button 
                                  type="button" 
                                  className="btn btn--outline" 
                                  onClick={() => { setExcelFile(null); setPreviewRows([]); setIsImportMode(false); }}
                                >
                                  Cancel
                                </button>
                                <button 
                                  type="button" 
                                  className="btn btn--primary" 
                                  onClick={handleSaveImport}
                                  disabled={previewRows.filter(r => r.isValid).length === 0}
                                >
                                  Import Valid Rows ({previewRows.filter(r => r.isValid).length})
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* STANDARD DIRECTORY LIST */
                  <div>
                    {/* Filter and Upload Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {/* Search Employee */}
                      <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                        <SearchIcon style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-muted-fg)', width: '18px', height: '18px' }} />
                        <input
                          type="text"
                          className="form-input"
                          value={searchEmployeeQuery}
                          onChange={e => setSearchEmployeeQuery(e.target.value)}
                          placeholder="Search employees..."
                          style={{ paddingLeft: '34px', height: '38px', marginBottom: 0 }}
                        />
                      </div>
                      
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        {/* Manual Add Trigger */}
                        <button 
                          type="button" 
                          className="btn btn--outline"
                          onClick={() => {
                            setIsManualAddMode(true);
                            setManualName('');
                            setManualEmail('');
                            setManualDept('');
                            setManualEmpId('');
                            setManualDesignation('');
                            setManualPhone('');
                            setManualLocation('');
                            setManualError('');
                          }}
                          style={{ height: '38px', padding: '0 var(--space-3)' }}
                        >
                          <AddIcon className="btn-icon" />
                          Add Manually
                        </button>
                        
                        {/* Import Excel Trigger */}
                        <button 
                          type="button" 
                          className="btn btn--primary"
                          onClick={() => {
                            setIsImportMode(true);
                            setIsManualAddMode(false);
                          }}
                          style={{ height: '38px', padding: '0 var(--space-3)' }}
                        >
                          <FileUploadIcon className="btn-icon" />
                          Import Excel
                        </button>
                      </div>
                    </div>

                    {/* Directory table */}
                    {employeesLoading ? (
                      <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-muted-fg)' }}>
                        Loading employees directory...
                      </div>
                    ) : (
                      (() => {
                        const orgEmployees = employees.filter(
                          e => e.organization_id === viewingOrg.id
                        );
                        
                        const filteredEmployees = orgEmployees.filter(emp => {
                          const query = searchEmployeeQuery.toLowerCase();
                          return (
                            emp.name.toLowerCase().includes(query) ||
                            emp.email.toLowerCase().includes(query) ||
                            Object.values(emp.metadata || {}).some(v => 
                              String(v).toLowerCase().includes(query)
                            )
                          );
                        });

                        if (orgEmployees.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                              <PeopleIcon style={{ width: '40px', height: '40px', color: 'var(--color-muted-fg)', marginBottom: '8px' }} />
                              <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-1) 0' }}>No employees found</p>
                              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', margin: '0 0 var(--space-4) 0' }}>
                                Import your employee spreadsheet or add manually to populate the directory.
                              </p>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)' }}>
                                <button 
                                  type="button" 
                                  className="btn btn--outline" 
                                  onClick={() => {
                                    setIsManualAddMode(true);
                                    setManualName('');
                                    setManualEmail('');
                                    setManualDept('');
                                    setManualEmpId('');
                                    setManualDesignation('');
                                    setManualPhone('');
                                    setManualLocation('');
                                    setManualError('');
                                  }}
                                >
                                  <AddIcon className="btn-icon" />
                                  Add Manually
                                </button>
                                <button 
                                  type="button" 
                                  className="btn btn--primary" 
                                  onClick={() => {
                                    setIsImportMode(true);
                                    setIsManualAddMode(false);
                                  }}
                                >
                                  <FileUploadIcon className="btn-icon" />
                                  Upload Excel Sheet
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (filteredEmployees.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-muted-fg)' }}>
                              No matching employees found for your search query.
                            </div>
                          );
                        }

                        return (
                          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                              <thead style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Name</th>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Official Email</th>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Personal Email</th>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>User Code</th>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Additional Fields</th>
                                  <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Status</th>
                                  <th style={{ padding: 'var(--space-3)', width: '60px' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredEmployees.map((emp) => (
                                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: 'var(--space-3)', fontWeight: 500 }}>{emp.name}</td>
                                    <td style={{ padding: 'var(--space-3)' }}>{emp.email}</td>
                                    <td style={{ padding: 'var(--space-3)' }}>{emp.personal_email || (emp.metadata && emp.metadata.personal_email) || ''}</td>
                                    <td style={{ padding: 'var(--space-3)' }}>
                                      {emp.code ? (
                                        <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-primary)' }}>{emp.code}</span>
                                      ) : (
                                        <span className="badge badge--neutral" style={{ fontSize: '11px', fontWeight: 600 }}>Multi-Code</span>
                                      )}
                                    </td>
                                    <td style={{ padding: 'var(--space-3)' }}>
                                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {Object.entries(emp.metadata || {})
                                          .filter(([k]) => k !== 'personal_email' && k !== 'registered_via_multi_use_code')
                                          .map(([k, v]) => (
                                            <span 
                                              key={k} 
                                              title={`${k}: ${v}`}
                                              style={{ 
                                                fontSize: '10px', 
                                                background: 'var(--color-bg)', 
                                                padding: '2px 8px', 
                                                borderRadius: '10px',
                                                border: '1px solid var(--color-border)',
                                                whiteSpace: 'nowrap',
                                                textOverflow: 'ellipsis',
                                                overflow: 'hidden',
                                                maxWidth: '150px'
                                              }}
                                            >
                                              {k}: {String(v)}
                                            </span>
                                          ))}
                                        {Object.keys(emp.metadata || {}).filter(k => k !== 'personal_email' && k !== 'registered_via_multi_use_code').length === 0 && (
                                          <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic', fontSize: 'var(--text-xs)' }}>None</span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: 'var(--space-3)' }}>
                                      <span 
                                        className={`badge badge--${emp.registered ? 'success' : 'neutral'}`} 
                                        style={{ fontSize: '11px', padding: '2px 8px', fontWeight: 600 }}
                                      >
                                        {emp.registered ? 'Registered' : 'Pending'}
                                      </span>
                                    </td>
                                    <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                        style={{ 
                                          background: 'none', 
                                          border: 'none', 
                                          cursor: 'pointer', 
                                          color: 'var(--color-destructive)', 
                                          padding: '2px' 
                                        }}
                                        title="Delete Employee"
                                      >
                                        <DeleteIcon style={{ width: '16px', height: '16px' }} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'codes' && (
              /* TAB 3: Code Generation */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

                {/* Create Code Form */}
                <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
                  <h4 style={{ fontWeight: 700, fontSize: 'var(--text-md)', margin: '0 0 var(--space-4) 0' }}>Create New Signup Code</h4>

                  {codesError && (
                    <div style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-xs)', fontWeight: 600, padding: 'var(--space-2) var(--space-3)', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-destructive)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <WarningIcon style={{ width: '14px', height: '14px', flexShrink: 0 }} /> {codesError}
                    </div>
                  )}
                  {codesSuccess && (
                    <div style={{ color: 'var(--color-success, #16a34a)', fontSize: 'var(--text-xs)', fontWeight: 600, padding: 'var(--space-2) var(--space-3)', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--color-success, #16a34a)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircleIcon style={{ width: '14px', height: '14px', flexShrink: 0 }} /> {codesSuccess}
                    </div>
                  )}

                  <form onSubmit={handleCreateCode} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {/* Code Type Toggle */}
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      {['random', 'custom'].map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: codeType === t ? 700 : 400, color: codeType === t ? 'var(--color-primary)' : 'var(--color-muted-fg)' }}>
                          <input
                            type="radio"
                            name="codeType"
                            value={t}
                            checked={codeType === t}
                            onChange={() => { setCodeType(t); setCustomCode(''); setCodesError(''); }}
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                          {t === 'random' ? 'Random Code (auto-generated)' : 'Custom Code (you type it)'}
                        </label>
                      ))}
                    </div>

                    {/* Custom Code Field (conditional) */}
                    {codeType === 'custom' && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Your Custom Code</label>
                        <input
                          type="text"
                          className="form-input"
                          value={customCode}
                          onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                          placeholder="e.g. HCL2026"
                          maxLength={20}
                          style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' }}
                        />
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', margin: '4px 0 0' }}>Letters and numbers only. Will be stored in UPPERCASE.</p>
                      </div>
                    )}

                    {/* Max Signups */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Max Signups Allowed</label>
                      <input
                        type="number"
                        className="form-input"
                        value={maxSignups}
                        min={1}
                        max={10000}
                        onChange={e => setMaxSignups(e.target.value)}
                        style={{ maxWidth: '160px' }}
                      />
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', margin: '4px 0 0' }}>How many users can sign up using this code.</p>
                    </div>

                    <div>
                      <button type="submit" className="btn btn--primary" disabled={creatingCode}>
                        {creatingCode ? 'Creating...' : '+ Create Code'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Codes List */}
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 'var(--text-sm)', margin: '0 0 var(--space-3) 0', color: 'var(--color-muted-fg)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Generated Codes ({generatedCodes.length})
                  </h4>

                  {codesLoading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-muted-fg)', fontSize: 'var(--text-sm)' }}>Loading codes...</div>
                  ) : generatedCodes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-muted-fg)', fontSize: 'var(--text-sm)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      No codes created yet for this organization.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                        <thead style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Code</th>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Type</th>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Signups Used / Max</th>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Created</th>
                            <th style={{ padding: 'var(--space-3)', fontWeight: 600 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generatedCodes.map(gc => (
                            <tr key={gc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: 'var(--space-3)' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-primary)', fontSize: 'var(--text-md)', letterSpacing: '0.08em' }}>{gc.code}</span>
                                <button
                                  onClick={() => handleCopyCode(gc.code)}
                                  title="Copy code"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '8px', color: copiedCode === gc.code ? 'var(--color-success, #16a34a)' : 'var(--color-muted-fg)', verticalAlign: 'middle' }}
                                >
                                  <ContentCopyIcon style={{ width: '14px', height: '14px' }} />
                                </button>
                                {copiedCode === gc.code && <span style={{ fontSize: '10px', color: 'var(--color-success, #16a34a)', marginLeft: '4px' }}>Copied!</span>}
                              </td>
                              <td style={{ padding: 'var(--space-3)', textTransform: 'capitalize', color: 'var(--color-muted-fg)' }}>{gc.code_type || gc.codeType || '—'}</td>
                              <td style={{ padding: 'var(--space-3)' }}>
                                <span style={{ fontWeight: 600 }}>{gc.signups_used ?? gc.signupsUsed ?? 0}</span>
                                <span style={{ color: 'var(--color-muted-fg)' }}> / {gc.max_signups ?? gc.maxSignups}</span>
                                {/* Progress bar */}
                                <div style={{ height: '4px', background: 'var(--color-border)', borderRadius: '4px', marginTop: '4px', overflow: 'hidden', maxWidth: '120px' }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${Math.min(100, ((gc.signups_used ?? gc.signupsUsed ?? 0) / (gc.max_signups ?? gc.maxSignups)) * 100)}%`,
                                    background: gc.status === 'depleted' ? 'var(--color-destructive)' : 'var(--color-primary)',
                                    borderRadius: '4px',
                                    transition: 'width 0.3s'
                                  }} />
                                </div>
                              </td>
                              <td style={{ padding: 'var(--space-3)' }}>
                                <span className={`badge badge--${gc.status === 'active' ? 'success' : gc.status === 'depleted' ? 'warning' : 'error'}`}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}
                                >
                                  {gc.status === 'active' && <CheckCircleIcon style={{ width: '11px', height: '11px' }} />}
                                  {gc.status === 'inactive' && <CancelIcon style={{ width: '11px', height: '11px' }} />}
                                  {gc.status}
                                </span>
                              </td>
                              <td style={{ padding: 'var(--space-3)', color: 'var(--color-muted-fg)', fontSize: 'var(--text-xs)' }}>
                                {gc.created_at ? new Date(gc.created_at).toLocaleDateString() : '—'}
                              </td>
                              <td style={{ padding: 'var(--space-3)' }}>
                                {gc.status !== 'depleted' && (
                                  <button
                                    className={`btn btn--outline`}
                                    style={{ fontSize: '11px', padding: '4px 10px', color: gc.status === 'active' ? 'var(--color-destructive)' : 'var(--color-success, #16a34a)', borderColor: gc.status === 'active' ? 'var(--color-destructive)' : 'var(--color-success, #16a34a)' }}
                                    onClick={() => handleToggleCodeStatus(gc)}
                                  >
                                    {gc.status === 'active' ? 'Deactivate' : 'Activate'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-6)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
              <button className="btn btn--primary" onClick={handleViewClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteDialogOpen && deletingOrg && (
        <div className="overlay overlay--visible" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, background: 'rgba(0,0,0,0.6)' }}>
          <div className="auth-card" style={{ maxWidth: '450px', margin: 'var(--space-4)', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-destructive)' }}>Delete Organization</h2>
              <button onClick={handleDeleteCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted-fg)' }}>
                <CloseIcon />
              </button>
            </div>
            
            <p style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-6)', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deletingOrg.name}</strong>? This action cannot be undone.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button type="button" className="btn btn--outline" onClick={handleDeleteCancel}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn" 
                onClick={handleDeleteConfirm}
                style={{ backgroundColor: 'var(--color-destructive)', color: 'white', borderColor: 'var(--color-destructive)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationManager;
