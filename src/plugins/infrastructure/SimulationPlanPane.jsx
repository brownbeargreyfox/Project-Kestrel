import React, { useMemo } from 'react';
import { useDashboardStore } from '../../store/useDashboardStore';
import StatusBadge from '../feedback/StatusBadge';
import { X, Server, AlertTriangle } from 'lucide-react';

// --- Dynamic Impact Calculation Logic ---

const getAssetWeight = (asset) => {
  switch (asset?.type) {
    case 'db': return 10;
    case 'api': return 5;
    case 'cache': case 'queue': return 3;
    case 'web': return 2;
    default: return 1;
  }
};

const getTierMultiplier = (asset) => {
  if (asset?.group?.toLowerCase().includes('production')) return 3;
  if (asset?.group?.toLowerCase().includes('staging')) return 1.5;
  return 1;
};

const getTimeOfDayMultiplier = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  if (day >= 1 && day <= 5 && hour >= 9 && hour < 17) {
    return 2; // Business hours
  }
  return 0.5; // Off-hours
};

// Multiplier for the type of action being performed
const getActionMultiplier = (actionType) => {
  switch (actionType) {
    case 'terminate': return 2.0;
    case 'shutdown': return 1.5;
    case 'reboot': return 1.0;
    case 'patch': return 0.8;
    case 'simulate-failure': return 2.5;
    case 'simulate-network-loss': return 2.0;
    case 'lockdown': return 1.3;
    case 'rotate-keys': return 0.6;
    default: return 0.5;
  }
};

// Check for dependency risks
const getDependencyRisk = (selectedAssets, serverOverview) => {
  let riskFactors = [];
  let dependencyMultiplier = 1;
  
  selectedAssets.forEach(asset => {
    // Check if this is a single point of failure
    const sameTypeInGroup = serverOverview.filter(a => 
      a.type === asset.type && 
      a.group === asset.group && 
      a.status === 'healthy'
    );
    
    if (sameTypeInGroup.length === 1) {
      riskFactors.push(`${asset.name} is a single point of failure`);
      dependencyMultiplier *= 1.8;
    }
    
    // Check for database operations during business hours
    if (asset.type === 'db' && getTimeOfDayMultiplier() > 1) {
      riskFactors.push(`Database operation during peak hours`);
      dependencyMultiplier *= 1.5;
    }
    
    // Check for production operations
    if (asset.group?.toLowerCase().includes('production')) {
      riskFactors.push(`Production environment affected`);
    }
  });
  
  return { riskFactors, dependencyMultiplier };
};

// Get considerations for real implementation
const getImplementationConsiderations = (impactLevel, actionType, affectedAssets) => {
  const considerations = [];
  
  if (impactLevel === 'Critical' || actionType === 'terminate') {
    considerations.push('Would require senior leadership approval');
    considerations.push('Should involve change advisory review');
  } else if (impactLevel === 'High' || actionType === 'simulate-failure') {
    considerations.push('Would need senior engineer sign-off');
    considerations.push('Consider having incident response ready');
  }
  
  if (affectedAssets.some(a => a.group?.toLowerCase().includes('production'))) {
    considerations.push('Should be done during maintenance window');
    considerations.push('Ensure rollback plan is ready');
  }
  
  return considerations;
};

const groupedActions = [
  {
    label: '🖥️ Server Lifecycle',
    actions: [
      { value: 'reboot', label: 'Reboot Server', description: 'Restart the selected servers immediately.' },
      { value: 'shutdown', label: 'Shutdown Server', description: 'Gracefully power down the servers.' },
      { value: 'start', label: 'Start Server', description: 'Boot up the selected instances.' },
      { value: 'terminate', label: 'Terminate Instance', description: 'Permanently destroy the server instance.' },
    ],
  },
  {
    label: '🔐 Security & Compliance',
    actions: [
      { value: 'patch', label: 'Apply OS Patches', description: 'Install available OS updates.' },
      { value: 'scan', label: 'Run Security Scan', description: 'Check for vulnerabilities and compliance issues.' },
      { value: 'rotate-keys', label: 'Rotate API/SSH Keys', description: 'Replace all authentication credentials.' },
      { value: 'lockdown', label: 'Apply Lockdown Policy', description: 'Restrict services and access for hardening.' },
    ],
  },
  {
    label: '🧪 Simulation & Validation',
    actions: [
      { value: 'simulate-failure', label: 'Inject Failure', description: 'Simulate a crash to test HA/DR.' },
      { value: 'validate-dr', label: 'Validate DR Readiness', description: 'Dry-run disaster recovery workflow.' },
      { value: 'simulate-network-loss', label: 'Test Network Partition', description: 'Simulate a network outage.' },
    ],
  },
];

export default function SimulationPlanPane({ 
  onStartSimulation = () => {}, 
  onOpenConfirmation = () => {}, 
  onDiscard = () => {} 
}) {
  const {
    selectedAssets,
    simulationPlan,
    setSimulationPlan,
    serverOverview,
    isSimulationRunning,
    impactedAssets,
    stopSimulation,
  } = useDashboardStore();

  const selectedAction = simulationPlan?.action?.type || 'reboot';
  const selectedMeta = groupedActions.flatMap((g) => g.actions).find((a) => a.value === selectedAction);

  const selectedAssetDetails = useMemo(() => {
    // Handle case where serverOverview isn't loaded yet
    if (!serverOverview || serverOverview.length === 0) {
      console.warn('Server overview data not available yet');
      return [];
    }
    
    return Array.from(selectedAssets || [])
      .map((id) => serverOverview.find((asset) => asset.id === id))
      .filter(Boolean);
  }, [selectedAssets, serverOverview]);

  const estimatedImpact = useMemo(() => {
    if (selectedAssetDetails.length === 0) {
      return { 
        impactLevel: 'Minimal', 
        affectedUsers: 0, 
        estimatedDowntime: 'N/A', 
        estimatedRevenue: 0,
        riskFactors: [],
        implementationConsiderations: [],
        shouldUseMaintenanceWindow: false
      };
    }
    
    const rawImpactScore = selectedAssetDetails.reduce((acc, asset) => {
      return acc + (getAssetWeight(asset) * getTierMultiplier(asset));
    }, 0);

    // Check dependencies and risks
    const { riskFactors, dependencyMultiplier } = getDependencyRisk(selectedAssetDetails, serverOverview);

    // Apply all multipliers
    const finalImpactScore = rawImpactScore * getTimeOfDayMultiplier() * getActionMultiplier(selectedAction) * dependencyMultiplier;

    let impactLevel = 'Low';
    if (finalImpactScore > 50) impactLevel = 'Critical';
    else if (finalImpactScore > 25) impactLevel = 'High';
    else if (finalImpactScore > 10) impactLevel = 'Medium';
    
    // Determine if maintenance window is needed
    const needsMaintenanceWindow = impactLevel === 'High' || impactLevel === 'Critical' || 
                                  selectedAssetDetails.some(a => a.group?.toLowerCase().includes('production'));
    
    const implementationConsiderations = getImplementationConsiderations(impactLevel, selectedAction, selectedAssetDetails);
    
    return {
      impactLevel,
      affectedUsers: Math.floor(finalImpactScore * 150),
      estimatedDowntime: `${Math.ceil(finalImpactScore * 0.5)} - ${Math.ceil(finalImpactScore * 1.5)} min`,
      estimatedRevenue: Math.floor(finalImpactScore * 1250),
      riskFactors,
      implementationConsiderations,
      shouldUseMaintenanceWindow: needsMaintenanceWindow,
      maintenanceWindow: needsMaintenanceWindow
    };
  }, [selectedAssetDetails, selectedAction, serverOverview]);

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col">
       {/* Header */}
       <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
         <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
           {isSimulationRunning ? 'Simulation Active' : 'Simulation Plan'}
         </h2>
         <button onClick={() => stopSimulation('Discarded')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
           <X className="w-4 h-4" />
         </button>
       </div>
       
       {/* Content */}
       <div className="flex-1 overflow-y-auto p-4 space-y-6">
         {/* Selected Assets */}
         <div>
           <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Selected Assets</h3>
           <div className="space-y-2 max-h-40 overflow-y-auto">
             {selectedAssetDetails.map((asset) => (
               <div key={asset.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                 <div className="text-gray-600 dark:text-gray-400"><Server className="w-4 h-4" /></div>
                 <div className="flex-1 min-w-0">
                   <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{asset.name}</p>
                   <p className="text-xs text-gray-500 dark:text-gray-400">{asset.group}</p>
                 </div>
                 <StatusBadge status={asset.status} size="xs" />
               </div>
             ))}
           </div>
         </div>
 
         {/* Planned Action + Description */}
         <div>
           <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Planned Action</h3>
           <select
             value={selectedAction}
             onChange={(e) => setSimulationPlan({ ...simulationPlan, action: { type: e.target.value } })}
             disabled={isSimulationRunning}
             className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
           >
             {groupedActions.map((group) => (
               <optgroup key={group.label} label={group.label}>
                 {group.actions.map((action) => (
                   <option key={action.value} value={action.value}>
                     {action.label}
                   </option>
                 ))}
               </optgroup>
             ))}
           </select>
           {selectedMeta && (
             <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-tight">
               <strong>{selectedMeta.label}</strong>: {selectedMeta.description}
             </p>
           )}
         </div>
 
         {/* Reason Textarea */}
         <div>
           <textarea
             value={simulationPlan?.description || ''}
             onChange={(e) => setSimulationPlan({ ...simulationPlan, description: e.target.value })}
             disabled={isSimulationRunning}
             placeholder="Optional: Describe the reason for this change..."
             className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
             rows={3}
           />
         </div>
 
         {/* Impact Panel */}
         <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
           <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
             <AlertTriangle className="w-4 h-4" /> Impact Analysis
           </h3>
           <ul className="text-sm space-y-1 text-gray-800 dark:text-gray-300">
             <li><strong>Impact Level:</strong> <span className={`font-semibold ${
               estimatedImpact.impactLevel === 'Critical' ? 'text-red-600 dark:text-red-400' :
               estimatedImpact.impactLevel === 'High' ? 'text-orange-600 dark:text-orange-400' :
               estimatedImpact.impactLevel === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' :
               'text-green-600 dark:text-green-400'
             }`}>{estimatedImpact.impactLevel}</span></li>
             <li><strong>Estimated Downtime:</strong> {estimatedImpact.estimatedDowntime}</li>
             <li><strong>Affected Users:</strong> ~{estimatedImpact.affectedUsers.toLocaleString()}</li>
             <li><strong>Est. Revenue Impact:</strong> ${estimatedImpact.estimatedRevenue.toLocaleString()}</li>
           </ul>
           
           {/* Risk Factors */}
           {estimatedImpact.riskFactors.length > 0 && (
             <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
               <h4 className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">⚠️ Risk Factors</h4>
               <ul className="text-xs text-red-700 dark:text-red-200 space-y-0.5">
                 {estimatedImpact.riskFactors.map((risk, idx) => (
                   <li key={idx}>• {risk}</li>
                 ))}
               </ul>
             </div>
           )}
           
           {/* Implementation Considerations */}
           {estimatedImpact.implementationConsiderations.length > 0 && (
             <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
               <h4 className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">💡 If implementing for real</h4>
               <ul className="text-xs text-blue-700 dark:text-blue-200 space-y-0.5">
                 {estimatedImpact.implementationConsiderations.map((consideration, idx) => (
                   <li key={idx}>• {consideration}</li>
                 ))}
               </ul>
             </div>
           )}
           
           {/* Maintenance Window Notice */}
           {estimatedImpact.shouldUseMaintenanceWindow && (
             <div className="mt-3 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded">
               <h4 className="text-xs font-medium text-purple-900 dark:text-purple-100 mb-1">⏰ Timing Consideration</h4>
               <p className="text-xs text-purple-700 dark:text-purple-200">
                 Real implementation would benefit from a scheduled maintenance window
               </p>
             </div>
           )}
         </div>
 
         {/* Blast Radius */}
         {isSimulationRunning && impactedAssets.size > 0 && (
           <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
             <h3 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-2">Active Blast Radius</h3>
             <p className="text-xs text-orange-700 dark:text-orange-200">
               {impactedAssets.size} downstream asset{impactedAssets.size !== 1 ? 's' : ''} currently impacted.
             </p>
           </div>
         )}
       </div>
 
       {/* Action Buttons */}
       <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
         {/* Simulation Notes */}
         {!isSimulationRunning && selectedAssets.size > 0 && estimatedImpact.impactLevel !== 'Low' && (
           <div className="text-xs bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-700">
             <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-1">🧪 Simulation Notes</h4>
             <p className="text-amber-700 dark:text-amber-200">
               This simulation will help you understand the blast radius and downstream effects before implementing any real changes.
             </p>
           </div>
         )}
         
         {!isSimulationRunning ? (
           <button
             onClick={onStartSimulation}
             disabled={selectedAssets.size === 0}
             className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md"
           >
             Start Simulation
           </button>
         ) : (
           <button
             onClick={onOpenConfirmation}
             className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
           >
             Execute Plan
           </button>
         )}
         <button
           onClick={onDiscard}
           className="w-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 text-gray-900 dark:text-white font-medium py-2 px-4 rounded-md"
         >
           Discard / Clear
         </button>
       </div>
     </div>
  );
}
