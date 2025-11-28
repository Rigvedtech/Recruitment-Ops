'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';

interface SourceTemplate {
  template_id: string;
  source: string;
  cost: number;
}

interface Recruiter {
  user_id: string;
  username: string;
  full_name: string;
  email: string;
}

interface CustomCost {
  label: string;
  amount: number;
}

interface CalculationResult {
  profile_count: number;
  source_cost: number;
  profile_source_cost: number;
  infra_cost: number;
  custom_costs: CustomCost[];
  total_custom_cost: number;
  company_cost: number;
  recruiter_salary: number;
}

const CostingPage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'per-unit' | 'monthly'>('per-unit');
  
  // Source templates
  const [sourceTemplates, setSourceTemplates] = useState<SourceTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplates, setEditingTemplates] = useState<SourceTemplate[]>([]);
  
  // Recruiters
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  
  // Per Unit Form State
  const [perUnitForm, setPerUnitForm] = useState({
    recruiter_id: '',
    start_date: '',
    end_date: '',
    source_cost: 0,
    recruiter_salary: 0,
    infra_cost: 0,
    custom_costs: [] as CustomCost[]
  });
  const [perUnitProfileCount, setPerUnitProfileCount] = useState(0);
  const [perUnitResult, setPerUnitResult] = useState<CalculationResult | null>(null);
  
  // Monthly Form State
  const [monthlyForm, setMonthlyForm] = useState({
    start_date: '',
    end_date: '',
    source_cost: 0,
    recruiter_salary: 0,
    infra_cost: 0,
    custom_costs: [] as CustomCost[]
  });
  const [monthlyProfileCount, setMonthlyProfileCount] = useState(0);
  const [monthlyResult, setMonthlyResult] = useState<CalculationResult | null>(null);
  
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is logged in and has admin role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
          fetchInitialData();
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error('Error parsing stored user data:', err);
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
    setLoading(false);
  }, [router]);

  const fetchInitialData = async () => {
    try {
      const [templatesRes, recruitersRes] = await Promise.all([
        api.getSourceTemplates(),
        api.getRecruiters()
      ]);
      
      if (templatesRes.success) {
        setSourceTemplates(templatesRes.data);
      }
      
      if (recruitersRes.success) {
        setRecruiters(recruitersRes.data);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load initial data');
    }
  };

  const openTemplateModal = () => {
    setEditingTemplates(JSON.parse(JSON.stringify(sourceTemplates)));
    setShowTemplateModal(true);
  };

  const saveTemplates = async () => {
    try {
      const response = await api.updateSourceTemplates(editingTemplates);
      if (response.success) {
        setSourceTemplates(editingTemplates);
        setShowTemplateModal(false);
        alert('Source templates updated successfully!');
      }
    } catch (error) {
      console.error('Error saving templates:', error);
      alert('Failed to save templates');
    }
  };

  const updateTemplateValue = (index: number, cost: number) => {
    const updated = [...editingTemplates];
    updated[index].cost = cost;
    setEditingTemplates(updated);
  };

  const addCustomCost = (type: 'per-unit' | 'monthly') => {
    if (type === 'per-unit') {
      setPerUnitForm({
        ...perUnitForm,
        custom_costs: [...perUnitForm.custom_costs, { label: '', amount: 0 }]
      });
    } else {
      setMonthlyForm({
        ...monthlyForm,
        custom_costs: [...monthlyForm.custom_costs, { label: '', amount: 0 }]
      });
    }
  };

  const updateCustomCost = (type: 'per-unit' | 'monthly', index: number, field: 'label' | 'amount', value: string | number) => {
    if (type === 'per-unit') {
      const updated = [...perUnitForm.custom_costs];
      updated[index][field] = value as never;
      setPerUnitForm({ ...perUnitForm, custom_costs: updated });
    } else {
      const updated = [...monthlyForm.custom_costs];
      updated[index][field] = value as never;
      setMonthlyForm({ ...monthlyForm, custom_costs: updated });
    }
  };

  const removeCustomCost = (type: 'per-unit' | 'monthly', index: number) => {
    if (type === 'per-unit') {
      const updated = perUnitForm.custom_costs.filter((_, i) => i !== index);
      setPerUnitForm({ ...perUnitForm, custom_costs: updated });
    } else {
      const updated = monthlyForm.custom_costs.filter((_, i) => i !== index);
      setMonthlyForm({ ...monthlyForm, custom_costs: updated });
    }
  };

  const fetchPerUnitProfileCount = async () => {
    if (!perUnitForm.recruiter_id || !perUnitForm.start_date || !perUnitForm.end_date) {
      return;
    }
    
    try {
      const response = await api.getProfileCount({
        recruiter_id: perUnitForm.recruiter_id,
        start_date: perUnitForm.start_date,
        end_date: perUnitForm.end_date
      });
      
      if (response.success) {
        setPerUnitProfileCount(response.data.profile_count);
      }
    } catch (error) {
      console.error('Error fetching profile count:', error);
    }
  };

  const fetchMonthlyProfileCount = async () => {
    if (!monthlyForm.start_date || !monthlyForm.end_date) {
      return;
    }
    
    try {
      const response = await api.getProfileCount({
        start_date: monthlyForm.start_date,
        end_date: monthlyForm.end_date
      });
      
      if (response.success) {
        setMonthlyProfileCount(response.data.profile_count);
      }
    } catch (error) {
      console.error('Error fetching profile count:', error);
    }
  };

  useEffect(() => {
    fetchPerUnitProfileCount();
  }, [perUnitForm.recruiter_id, perUnitForm.start_date, perUnitForm.end_date]);

  useEffect(() => {
    fetchMonthlyProfileCount();
  }, [monthlyForm.start_date, monthlyForm.end_date]);

  const calculatePerUnit = async () => {
    if (!perUnitForm.recruiter_id || !perUnitForm.start_date || !perUnitForm.end_date) {
      alert('Please fill in all required fields');
      return;
    }
    
    setCalculating(true);
    setError(null);
    
    try {
      const response = await api.calculatePerUnitCost(perUnitForm);
      if (response.success) {
        setPerUnitResult(response.data);
      }
    } catch (error) {
      console.error('Error calculating per unit cost:', error);
      setError('Failed to calculate per unit cost');
    } finally {
      setCalculating(false);
    }
  };

  const calculateMonthly = async () => {
    if (!monthlyForm.start_date || !monthlyForm.end_date) {
      alert('Please fill in all required fields');
      return;
    }
    
    setCalculating(true);
    setError(null);
    
    try {
      const response = await api.calculateMonthlyCost(monthlyForm);
      if (response.success) {
        setMonthlyResult(response.data);
      }
    } catch (error) {
      console.error('Error calculating monthly cost:', error);
      setError('Failed to calculate monthly cost');
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Costing Analysis</h1>
              <p className="text-lg text-gray-600">Calculate recruitment costs and analyze profitability</p>
            </div>
            <button
              onClick={openTemplateModal}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md"
            >
              Edit Source Cost Templates
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md p-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('per-unit')}
              className={`flex-1 py-3 px-6 rounded-md font-medium transition-colors ${
                activeTab === 'per-unit'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Per Unit Charge
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex-1 py-3 px-6 rounded-md font-medium transition-colors ${
                activeTab === 'monthly'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Monthly Charge
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Per Unit Tab Content */}
        {activeTab === 'per-unit' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-6">Per Unit Charge Calculator</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recruiter Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Recruiter <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={perUnitForm.recruiter_id}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, recruiter_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Choose a recruiter...</option>
                    {recruiters.map((recruiter) => (
                      <option key={recruiter.user_id} value={recruiter.user_id}>
                        {recruiter.full_name} ({recruiter.username})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={perUnitForm.start_date}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={perUnitForm.end_date}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {/* Profile Count Display */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Profiles</label>
                  <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-lg font-semibold text-indigo-600">
                    {perUnitProfileCount} profiles
                  </div>
                </div>

                {/* Source Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Source Cost (per profile)</label>
                  <select
                    value={perUnitForm.source_cost}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, source_cost: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value={0}>Select source cost...</option>
                    {sourceTemplates.map((template) => (
                      <option key={template.template_id} value={template.cost}>
                        {template.source.replace(/_/g, ' ')} - ₹{template.cost}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recruiter Base Salary */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Recruiter Base Salary</label>
                  <input
                    type="number"
                    value={perUnitForm.recruiter_salary}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, recruiter_salary: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Infrastructure Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Infrastructure Cost</label>
                  <input
                    type="number"
                    value={perUnitForm.infra_cost}
                    onChange={(e) => setPerUnitForm({ ...perUnitForm, infra_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Custom Costs */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Custom Costs</h3>
                  <button
                    onClick={() => addCustomCost('per-unit')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    + Add Custom Cost
                  </button>
                </div>
                
                {perUnitForm.custom_costs.map((cost, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <input
                      type="text"
                      value={cost.label}
                      onChange={(e) => updateCustomCost('per-unit', index, 'label', e.target.value)}
                      placeholder="Cost label..."
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={cost.amount}
                        onChange={(e) => updateCustomCost('per-unit', index, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="Amount..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        onClick={() => removeCustomCost('per-unit', index)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Calculate Button */}
              <div className="mt-6">
                <button
                  onClick={calculatePerUnit}
                  disabled={calculating}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {calculating ? 'Calculating...' : 'Calculate Per Unit Cost'}
                </button>
              </div>
            </div>

            {/* Results */}
            {perUnitResult && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-semibold text-gray-800 mb-6">Calculation Results</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Profile Count</div>
                    <div className="text-2xl font-bold text-blue-600">{perUnitResult.profile_count}</div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Source Cost (per profile)</div>
                    <div className="text-2xl font-bold text-blue-600">₹{perUnitResult.source_cost.toFixed(2)}</div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Total Source Cost</div>
                    <div className="text-2xl font-bold text-blue-600">₹{perUnitResult.profile_source_cost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ({perUnitResult.profile_count} × ₹{perUnitResult.source_cost})
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Infrastructure Cost</div>
                    <div className="text-2xl font-bold text-blue-600">₹{perUnitResult.infra_cost.toFixed(2)}</div>
                  </div>
                  
                  {perUnitResult.custom_costs.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 md:col-span-2">
                      <div className="text-sm text-gray-600 mb-2">Custom Costs</div>
                      {perUnitResult.custom_costs.map((cost, index) => (
                        <div key={index} className="flex justify-between items-center mb-1">
                          <span className="text-gray-700">{cost.label}</span>
                          <span className="font-semibold text-blue-600">₹{cost.amount.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t border-blue-300 mt-2 pt-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">Total Custom Costs</span>
                          <span className="font-bold text-blue-600">₹{perUnitResult.total_custom_cost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-300">
                    <div className="text-sm text-gray-600 mb-1">Recruiter Base Salary</div>
                    <div className="text-2xl font-bold text-gray-700">₹{perUnitResult.recruiter_salary.toFixed(2)}</div>
                  </div>
                  
                  <div className="bg-indigo-100 rounded-lg p-4 border-2 border-indigo-400 md:col-span-2">
                    <div className="text-sm text-gray-700 mb-1 font-medium">Company Cost</div>
                    <div className="text-3xl font-bold text-indigo-700">₹{perUnitResult.company_cost.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Monthly Tab Content */}
        {activeTab === 'monthly' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-6">Monthly Charge Calculator</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={monthlyForm.start_date}
                    onChange={(e) => setMonthlyForm({ ...monthlyForm, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={monthlyForm.end_date}
                    onChange={(e) => setMonthlyForm({ ...monthlyForm, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {/* Profile Count Display */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Profiles (in period)</label>
                  <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-lg font-semibold text-indigo-600">
                    {monthlyProfileCount} profiles
                  </div>
                </div>

                {/* Source Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Source Cost (per profile)</label>
                  <select
                    value={monthlyForm.source_cost}
                    onChange={(e) => setMonthlyForm({ ...monthlyForm, source_cost: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value={0}>Select source cost...</option>
                    {sourceTemplates.map((template) => (
                      <option key={template.template_id} value={template.cost}>
                        {template.source.replace(/_/g, ' ')} - ₹{template.cost}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recruiter Base Salary */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Recruiter Base Salary</label>
                  <input
                    type="number"
                    value={monthlyForm.recruiter_salary}
                    onChange={(e) => setMonthlyForm({ ...monthlyForm, recruiter_salary: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Infrastructure Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Infrastructure Cost</label>
                  <input
                    type="number"
                    value={monthlyForm.infra_cost}
                    onChange={(e) => setMonthlyForm({ ...monthlyForm, infra_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Custom Costs */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Custom Costs</h3>
                  <button
                    onClick={() => addCustomCost('monthly')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    + Add Custom Cost
                  </button>
                </div>
                
                {monthlyForm.custom_costs.map((cost, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <input
                      type="text"
                      value={cost.label}
                      onChange={(e) => updateCustomCost('monthly', index, 'label', e.target.value)}
                      placeholder="Cost label..."
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={cost.amount}
                        onChange={(e) => updateCustomCost('monthly', index, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="Amount..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        onClick={() => removeCustomCost('monthly', index)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Calculate Button */}
              <div className="mt-6">
                <button
                  onClick={calculateMonthly}
                  disabled={calculating}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {calculating ? 'Calculating...' : 'Calculate Monthly Cost'}
                </button>
              </div>
            </div>

            {/* Results */}
            {monthlyResult && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-semibold text-gray-800 mb-6">Calculation Results</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Profile Count (Period)</div>
                    <div className="text-2xl font-bold text-blue-600">{monthlyResult.profile_count}</div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Source Cost (per profile)</div>
                    <div className="text-2xl font-bold text-blue-600">₹{monthlyResult.source_cost.toFixed(2)}</div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Total Source Cost</div>
                    <div className="text-2xl font-bold text-blue-600">₹{monthlyResult.profile_source_cost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ({monthlyResult.profile_count} × ₹{monthlyResult.source_cost})
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Infrastructure Cost</div>
                    <div className="text-2xl font-bold text-blue-600">₹{monthlyResult.infra_cost.toFixed(2)}</div>
                  </div>
                  
                  {monthlyResult.custom_costs.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 md:col-span-2">
                      <div className="text-sm text-gray-600 mb-2">Custom Costs</div>
                      {monthlyResult.custom_costs.map((cost, index) => (
                        <div key={index} className="flex justify-between items-center mb-1">
                          <span className="text-gray-700">{cost.label}</span>
                          <span className="font-semibold text-blue-600">₹{cost.amount.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t border-blue-300 mt-2 pt-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">Total Custom Costs</span>
                          <span className="font-bold text-blue-600">₹{monthlyResult.total_custom_cost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-300">
                    <div className="text-sm text-gray-600 mb-1">Recruiter Base Salary</div>
                    <div className="text-2xl font-bold text-gray-700">₹{monthlyResult.recruiter_salary.toFixed(2)}</div>
                  </div>
                  
                  <div className="bg-indigo-100 rounded-lg p-4 border-2 border-indigo-400 md:col-span-2">
                    <div className="text-sm text-gray-700 mb-1 font-medium">Company Cost</div>
                    <div className="text-3xl font-bold text-indigo-700">₹{monthlyResult.company_cost.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source Cost Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Edit Source Cost Templates</h2>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                {editingTemplates.map((template, index) => (
                  <div key={template.template_id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {template.source.replace(/_/g, ' ')}
                      </label>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        value={template.cost}
                        onChange={(e) => updateTemplateValue(index, parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-4 mt-6">
                <button
                  onClick={saveTemplates}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                >
                  Save Templates
                </button>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostingPage;

