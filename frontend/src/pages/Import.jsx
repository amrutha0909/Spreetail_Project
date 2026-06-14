import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import AnomalyReview from '../components/AnomalyReview';
import { FileSpreadsheet, Upload, CheckCircle2, ChevronRight, AlertCircle, RefreshCw, BarChart2, ShieldCheck } from 'lucide-react';

/**
 * Import Wizard Page Component
 * 
 * Purpose:
 * Renders the multi-step CSV importer wizard:
 * Step 1: Upload (File picker/drag-and-drop CSV upload, POSTs to /api/import to get anomalies list).
 * Step 2: Review (Displays AnomalyReview card component, blocks execution until all ERRORs are solved).
 * Step 3: Execute (User selects the target expense Group, calls resolve and execute API endpoints).
 * Step 4: Summary Report (Displays machine-readable stats and resolution list logs).
 * 
 * Requirements:
 * - Disabled "Execute Import" button until all ERROR anomalies are resolved.
 * - Displays progress steps using a sleek stepper header.
 * - Integrates group dropdown lists to target the flatmates group.
 */
export default function Import() {
  const [step, setStep] = useState(1); // 1 = Upload, 2 = Review, 3 = Execute, 4 = Report
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [importRunId, setImportRunId] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [resolutions, setResolutions] = useState({}); // Mapping: anomalyId -> { resolution, resolvedData }
  
  // Group selections
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // Processing indicators
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

  // Summary Report results
  const [report, setReport] = useState(null);

  // Load groups list on mount to populate the execute group selector dropdown
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await api.get('/api/groups');
        setGroups(response.data);
        if (response.data.length > 0) {
          setSelectedGroupId(response.data[0].id.toString());
        }
      } catch (err) {
        console.error('Failed to fetch groups', err);
      }
    };
    fetchGroups();
  }, []);

  /**
   * handleFileChange
   * 
   * Purpose:
   * Reads the selected CSV file content as plain text using the FileReader API.
   */
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result);
    };
    reader.readAsText(selectedFile);
  };

  /**
   * handleUploadSubmit
   * 
   * Purpose:
   * Phase 1 submission.
   * Uploads raw CSV text to `/api/import` and retrieves anomalies array.
   */
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!csvText) {
      setError('Please select a valid CSV file.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/import', { csvText });
      const { importRunId: runId, anomalies: detectedAnomalies } = response.data;
      
      setImportRunId(runId);
      setAnomalies(detectedAnomalies);

      // Pre-initialize resolutions dictionary
      // Good rows (NONE) and INFO anomalies are auto-resolved to ACCEPTED
      const initResolutions = {};
      detectedAnomalies.forEach((a) => {
        if (a.severity === 'INFO' || a.anomalyType === 'NONE') {
          const defaultData = a.resolvedData ? JSON.parse(a.resolvedData) : null;
          initResolutions[a.id] = { resolution: 'ACCEPTED', resolvedData: defaultData };
        } else if (a.severity === 'WARNING') {
          // Warning anomalies default to ACCEPTED utilizing backend suggestion
          const defaultData = a.resolvedData ? JSON.parse(a.resolvedData) : null;
          initResolutions[a.id] = { resolution: 'ACCEPTED', resolvedData: defaultData };
        } else {
          // Errors are initialized to PENDING requiring explicit resolution
          initResolutions[a.id] = { resolution: 'PENDING', resolvedData: null };
        }
      });

      setResolutions(initResolutions);
      setStep(2); // Go to review step
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload and scan CSV');
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleAnomalyResolve
   * 
   * Purpose:
   * Updates resolutions state when a user chooses a resolution in AnomalyReview.
   */
  const handleAnomalyResolve = (anomalyId, decision) => {
    setResolutions((prev) => ({
      ...prev,
      [anomalyId]: decision
    }));
  };

  // Checks if there are any ERROR severity anomalies that remain PENDING
  const hasUnresolvedErrors = anomalies.some(
    (a) => a.severity === 'ERROR' && (!resolutions[a.id] || resolutions[a.id].resolution === 'PENDING')
  );

  /**
   * handleExecuteImport
   * 
   * Purpose:
   * Phase 2 submission.
   * Saves resolved decisions and executes the write transaction in PostgreSQL.
   */
  const handleExecuteImport = async () => {
    if (hasUnresolvedErrors) {
      setError('Please resolve all ERROR anomalies before executing import.');
      return;
    }
    if (!selectedGroupId) {
      setError('Please select a target expense group.');
      return;
    }

    setExecuting(true);
    setError('');

    try {
      // 1. Submit anomaly resolutions
      await api.post(`/api/import/${importRunId}/resolve`, { resolutions });

      // 2. Finalize database writes
      const response = await api.post(`/api/import/${importRunId}/execute`, {
        groupId: Number(selectedGroupId)
      });

      // 3. Retrieve completion summary report
      const reportRes = await api.get(`/api/import/${importRunId}/report`);
      setReport(reportRes.data);
      setStep(4); // Transition to summary report step
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to execute import transactions');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 4-Step Wizard Stepper Header Indicator */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">CSV Expenses Importer</h1>
          <p className="text-slate-400 text-sm">Two-phase audited CSV import wizard</p>
        </div>
      </div>

      {/* Stepper indicator bar */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
        <div className={`pb-3 border-b-2 ${step >= 1 ? 'border-indigo-500 text-indigo-400 font-extrabold' : 'border-slate-800'}`}>1. Upload File</div>
        <div className={`pb-3 border-b-2 ${step >= 2 ? 'border-indigo-500 text-indigo-400 font-extrabold' : 'border-slate-800'}`}>2. Audit Anomaly</div>
        <div className={`pb-3 border-b-2 ${step >= 3 ? 'border-indigo-500 text-indigo-400 font-extrabold' : 'border-slate-800'}`}>3. Target Group</div>
        <div className={`pb-3 border-b-2 ${step >= 4 ? 'border-indigo-500 text-indigo-400 font-extrabold' : 'border-slate-800'}`}>4. Import Summary</div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD PAGE SKELETON */}
      {step === 1 && (
        <div className="glass-panel p-8 max-w-xl mx-auto text-center space-y-6">
          <FileSpreadsheet className="h-16 w-16 text-indigo-400 mx-auto" />
          <div>
            <h3 className="text-xl font-bold text-slate-200">Upload Expenses CSV</h3>
            <p className="text-slate-400 mt-2 text-sm">
              Please choose the exported spreadsheet file. The system will parse rows and identify splits, currencies, or user inconsistencies.
            </p>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-6">
            <div className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl p-8 transition-colors relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                required
              />
              <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">
                {file ? file.name : 'Click to browse or drag CSV file here'}
              </p>
              {file && (
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !file}
              className="gradient-btn w-full py-3 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>Scan and Audit CSV</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: AUDIT ANOMALIES VIEW */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Review Audited Anomalies</h2>
              <p className="text-slate-400 text-xs mt-1">
                The scanner discovered issues. You must select resolutions for all Errors before proceeding.
              </p>
            </div>
            <button
              onClick={() => setStep(3)}
              disabled={hasUnresolvedErrors}
              className="gradient-btn flex items-center space-x-2 py-2 px-5 text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:from-indigo-600 disabled:to-indigo-600"
            >
              <span>Target Selection</span>
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>

          <AnomalyReview
            anomalies={anomalies}
            resolutions={resolutions}
            onResolve={handleAnomalyResolve}
            members={groups[0]?.members || []} // Provide seeded users list for reference lookup
          />

          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-800">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={hasUnresolvedErrors}
              className="gradient-btn px-6 py-2.5 text-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Proceed to Execute</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: TARGET GROUP SELECTION */}
      {step === 3 && (
        <div className="glass-panel p-8 max-w-xl mx-auto space-y-6">
          <ShieldCheck className="h-16 w-16 text-emerald-400 mx-auto" />
          <div className="text-center">
            <h3 className="text-xl font-bold text-slate-200">Select Target Group</h3>
            <p className="text-slate-400 mt-2 text-sm">
              Please choose which shared flat expense group these transactions will be imported into.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2" htmlFor="targetGroup">
                Target Group Name
              </label>
              <select
                id="targetGroup"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.description})</option>
                ))}
              </select>
            </div>

            <div className="pt-6 flex items-center justify-between border-t border-slate-800/80 mt-8">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={executing}
                className="gradient-btn px-6 py-2.5 text-sm flex items-center justify-center space-x-2 cursor-pointer"
              >
                {executing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Writing to Database...</span>
                  </>
                ) : (
                  <span>Execute and Import</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUMMARY REPORT DISPLAY */}
      {step === 4 && report && (
        <div className="space-y-8">
          <div className="glass-panel p-6 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center space-x-4">
              <div className="bg-emerald-600/10 p-3 rounded-2xl border border-emerald-500/20">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-200">Import Finalized Successfully!</h3>
                <p className="text-slate-400 text-xs mt-1">All resolved transactions have been written to PostgreSQL.</p>
              </div>
            </div>
            <Link
              to={`/groups/${selectedGroupId}`}
              className="gradient-btn py-2.5 px-5 text-sm text-center inline-block cursor-pointer font-bold"
            >
              Go to Group Expenses
            </Link>
          </div>

          {/* Machine-readable metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Rows</p>
              <p className="text-2xl font-black text-slate-200 mt-1">{report.totalRows}</p>
            </div>
            <div className="glass-panel p-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Imported Items</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">{report.importedRowsCount}</p>
            </div>
            <div className="glass-panel p-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Skipped Rows</p>
              <p className="text-2xl font-black text-rose-400 mt-1">{report.skippedRowsCount}</p>
            </div>
            <div className="glass-panel p-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Anomalies Audited</p>
              <p className="text-2xl font-black text-amber-400 mt-1">{report.anomalies.length}</p>
            </div>
          </div>

          {/* Resolutions summary logs */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
              <BarChart2 className="h-5 w-5 text-indigo-400" />
              <span>Anomaly Resolutions Report</span>
            </h3>

            <div className="glass-panel overflow-hidden border border-slate-800/80 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-sm">
                    <th className="py-4 px-6 w-24">Row</th>
                    <th className="py-4 px-6 w-32">Type</th>
                    <th className="py-4 px-6 w-32">Severity</th>
                    <th className="py-4 px-6 w-36">Decision</th>
                    <th className="py-4 px-6">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-350 text-sm">
                  {report.anomalies.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/20">
                      <td className="py-4 px-6 font-semibold">Row {a.rowNumber}</td>
                      <td className="py-4 px-6 font-medium text-slate-300">{a.anomalyType.replace(/_/g, ' ')}</td>
                      <td className="py-4 px-6">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold border uppercase ${
                          a.severity === 'ERROR' ? 'bg-rose-500/10 border-rose-500/25 text-rose-450' : a.severity === 'WARNING' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-sky-500/10 border-sky-500/25 text-sky-400'
                        }`}>
                          {a.severity}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          a.resolution === 'SKIPPED' ? 'bg-rose-950/40 text-rose-450 border border-rose-900/30' : a.resolution === 'ACCEPTED' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/30'
                        }`}>
                          {a.resolution}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400 italic">
                        {a.resolution === 'SKIPPED' ? 'Row excluded from database entry.' : a.resolution === 'ACCEPTED' ? 'Imported with default fixes.' : `Imported with overrides: ${JSON.stringify(a.resolvedData)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
