'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  MapPin,
  Briefcase,
  Building2,
  Clock,
  Filter,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  Users,
  Globe,
  TrendingUp,
  BookmarkPlus,
  ExternalLink,
  SlidersHorizontal,
  LayoutGrid,
  List,
} from 'lucide-react';
import {
  fetchJobs,
  fetchFilterOptions,
  fetchSearchSuggestions,
  fetchPortalStats,
  fetchFeaturedJobs,
  debounce,
  type Job,
  type FilterOptions,
  type SearchSuggestion,
  type PortalStats,
  type JobsFilters,
  type PaginationInfo,
} from '@/services/careerApi';

// ============================================================================
// COMPONENT: Job Card
// ============================================================================
interface JobCardProps {
  job: Job;
  viewMode: 'grid' | 'list';
}

const JobCard: React.FC<JobCardProps> = ({ job, viewMode }) => {
  const isGrid = viewMode === 'grid';

  return (
    <Link href={`/careers/${job.request_id}`}>
      <div
        className={`
          group relative bg-white border border-slate-200 rounded-xl
          hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50
          transition-all duration-300 cursor-pointer overflow-hidden
          ${isGrid ? 'p-6' : 'p-5 flex gap-6 items-start'}
        `}
      >
        {/* Badges */}
        <div className={`flex gap-2 ${isGrid ? 'mb-4' : 'absolute top-4 right-4'}`}>
          {job.is_new && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full">
              <Sparkles className="w-3 h-3" />
              New
            </span>
          )}
          {job.is_urgent && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 rounded-full">
              <TrendingUp className="w-3 h-3" />
              Urgent
            </span>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 ${isGrid ? '' : 'min-w-0'}`}>
          {/* Job Title */}
          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-2">
            {job.job_title || 'Untitled Position'}
          </h3>

          {/* Company & Location */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 mb-3">
            {job.company_name && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                {job.company_name}
              </span>
            )}
            {job.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                {job.location}
              </span>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {job.department && (
              <span className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-full">
                {job.department}
              </span>
            )}
            {job.job_type && (
              <span className="px-3 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full">
                {job.job_type}
              </span>
            )}
            {job.experience_range && (
              <span className="px-3 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-full">
                {job.experience_range}
              </span>
            )}
            {job.shift && (
              <span className="px-3 py-1 text-xs font-medium bg-cyan-50 text-cyan-700 rounded-full">
                {job.shift}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {job.posted_date_relative || 'Recently posted'}
            </span>
            <span className="text-sm font-medium text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1">
              View Details
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Hover Effect Border */}
        <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-indigo-400 transition-colors pointer-events-none" />
      </div>
    </Link>
  );
};

// ============================================================================
// COMPONENT: Filter Sidebar
// ============================================================================
interface FilterSidebarProps {
  filters: JobsFilters;
  filterOptions: FilterOptions | null;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  filterOptions,
  onFilterChange,
  onClearFilters,
  isOpen,
  onClose,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['location', 'department', 'job_type'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Only count actual user-selected filters, not pagination or sort preferences
  const userFilterKeys = ['search', 'location', 'department', 'job_type', 'experience', 'company', 'posted_within', 'shift'] as const;
  const activeFiltersCount = userFilterKeys.filter(
    (key) => filters[key as keyof typeof filters] && filters[key as keyof typeof filters] !== ''
  ).length;

  const FilterSection = ({
    title,
    sectionKey,
    options,
    selectedValue,
  }: {
    title: string;
    sectionKey: string;
    options: string[];
    selectedValue?: string;
  }) => {
    const isExpanded = expandedSections.has(sectionKey);
    const selectedValues = selectedValue ? selectedValue.split(',') : [];

    return (
      <div className="border-b border-slate-200 last:border-b-0">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="flex items-center justify-between w-full py-4 text-left hover:bg-slate-50 px-1 -mx-1 rounded"
        >
          <span className="font-medium text-slate-900">{title}</span>
          <ChevronDown
            className={`w-5 h-5 text-slate-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpanded && (
          <div className="pb-4 space-y-2 max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No options available</p>
            ) : (
              options.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg -mx-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={() => {
                      let newValues: string[];
                      if (selectedValues.includes(option)) {
                        newValues = selectedValues.filter((v) => v !== option);
                      } else {
                        newValues = [...selectedValues, option];
                      }
                      onFilterChange(sectionKey, newValues.join(','));
                    }}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700 flex-1">{option}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-900">Filters</h2>
          {activeFiltersCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <button
              onClick={onClearFilters}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {filterOptions && (
          <>
            <FilterSection
              title="Location"
              sectionKey="location"
              options={filterOptions.locations}
              selectedValue={filters.location}
            />
            <FilterSection
              title="Department"
              sectionKey="department"
              options={filterOptions.departments}
              selectedValue={filters.department}
            />
            <FilterSection
              title="Job Type"
              sectionKey="job_type"
              options={filterOptions.job_types}
              selectedValue={filters.job_type}
            />
            <FilterSection
              title="Company"
              sectionKey="company"
              options={filterOptions.companies}
              selectedValue={filters.company}
            />
            <FilterSection
              title="Experience"
              sectionKey="experience"
              options={filterOptions.experience_ranges}
              selectedValue={filters.experience}
            />
            <FilterSection
              title="Work Mode"
              sectionKey="shift"
              options={filterOptions.shifts}
              selectedValue={filters.shift}
            />

            {/* Posted Within */}
            <div className="border-b border-slate-200 last:border-b-0">
              <button
                onClick={() => toggleSection('posted_within')}
                className="flex items-center justify-between w-full py-4 text-left hover:bg-slate-50 px-1 -mx-1 rounded"
              >
                <span className="font-medium text-slate-900">Posted Within</span>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 transition-transform ${
                    expandedSections.has('posted_within') ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {expandedSections.has('posted_within') && (
                <div className="pb-4 space-y-2">
                  {filterOptions.posted_within_options.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg -mx-2"
                    >
                      <input
                        type="radio"
                        name="posted_within"
                        checked={filters.posted_within === option.value}
                        onChange={() => onFilterChange('posted_within', option.value)}
                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{option.label}</span>
                    </label>
                  ))}
                  {filters.posted_within && (
                    <button
                      onClick={() => onFilterChange('posted_within', '')}
                      className="text-sm text-slate-500 hover:text-slate-700 pl-7"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-24 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 w-80 max-w-full bg-white z-50 lg:hidden shadow-xl">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
};

// ============================================================================
// COMPONENT: Search Autocomplete
// ============================================================================
interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  suggestions: SearchSuggestion[];
  isLoading: boolean;
}

const SearchAutocomplete: React.FC<SearchAutocompleteProps> = ({
  value,
  onChange,
  onSearch,
  suggestions,
  isLoading,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    onChange(suggestion.value);
    setIsOpen(false);
    onSearch();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'job_title':
        return <Briefcase className="w-4 h-4" />;
      case 'location':
        return <MapPin className="w-4 h-4" />;
      case 'department':
        return <Building2 className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsOpen(false);
              onSearch();
            }
          }}
          placeholder="Search by job title, skills, or keywords..."
          className="w-full h-14 pl-12 pr-4 text-lg border-0 bg-transparent focus:ring-0 focus:outline-none placeholder:text-slate-400"
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
          {suggestions.map((suggestion, idx) => (
            <button
              key={`${suggestion.type}-${suggestion.value}-${idx}`}
              onClick={() => handleSuggestionClick(suggestion)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="text-slate-400">{getIcon(suggestion.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {suggestion.label}
                </p>
                <p className="text-xs text-slate-500 capitalize">{suggestion.type.replace('_', ' ')}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT: Pagination
// ============================================================================
interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange }) => {
  const { page, total_pages, total_count, has_prev, has_next } = pagination;

  const getVisiblePages = () => {
    const pages: (number | 'ellipsis')[] = [];
    const delta = 2;

    for (let i = 1; i <= total_pages; i++) {
      if (
        i === 1 ||
        i === total_pages ||
        (i >= page - delta && i <= page + delta)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }

    return pages;
  };

  if (total_pages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200">
      <p className="text-sm text-slate-600">
        Showing page <span className="font-medium">{page}</span> of{' '}
        <span className="font-medium">{total_pages}</span> ({total_count} jobs)
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!has_prev}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {getVisiblePages().map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[40px] h-10 rounded-lg font-medium transition-colors ${
                p === page
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!has_next}
          className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT: Stats Bar
// ============================================================================
interface StatsBarProps {
  stats: PortalStats | null;
}

const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {[
        { label: 'Open Positions', value: stats.total_jobs, icon: Briefcase, color: 'indigo' },
        { label: 'Locations', value: stats.total_locations, icon: Globe, color: 'emerald' },
        { label: 'Departments', value: stats.total_departments, icon: Building2, color: 'purple' },
        { label: 'New This Week', value: stats.recent_jobs, icon: Sparkles, color: 'amber' },
      ].map((stat) => (
        <div
          key={stat.label}
          className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4"
        >
          <div className={`p-3 rounded-xl bg-${stat.color}-50`}>
            <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-sm text-slate-500">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function CareersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [filters, setFilters] = useState<JobsFilters>({
    search: searchParams.get('search') || '',
    location: searchParams.get('location') || '',
    department: searchParams.get('department') || '',
    job_type: searchParams.get('job_type') || '',
    experience: searchParams.get('experience') || '',
    company: searchParams.get('company') || '',
    posted_within: searchParams.get('posted_within') || '',
    shift: searchParams.get('shift') || '',
    sort_by: searchParams.get('sort_by') || 'newest',
    page: parseInt(searchParams.get('page') || '1'),
    per_page: 12,
  });

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch filter options and stats on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [optionsData, statsData] = await Promise.all([
          fetchFilterOptions(),
          fetchPortalStats(),
        ]);
        setFilterOptions(optionsData);
        setStats(statsData);
      } catch (err) {
        console.error('Error loading initial data:', err);
      }
    };
    loadInitialData();
  }, []);

  // Fetch jobs when filters change
  useEffect(() => {
    const loadJobs = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchJobs(filters);
        setJobs(result.jobs);
        setPagination(result.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadJobs();
  }, [filters]);

  // Debounced search suggestions
  const loadSuggestions = useCallback(
    debounce(async (query: string) => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsSuggestionsLoading(true);
      try {
        const results = await fetchSearchSuggestions(query);
        setSuggestions(results);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setIsSuggestionsLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    loadSuggestions(searchQuery);
  }, [searchQuery, loadSuggestions]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'newest' && key !== 'per_page') {
        params.set(key, value.toString());
      }
    });
    const queryString = params.toString();
    const newUrl = queryString ? `/careers?${queryString}` : '/careers';
    window.history.replaceState(null, '', newUrl);
  }, [filters]);

  // Handlers
  const handleSearch = () => {
    setFilters((prev) => ({
      ...prev,
      search: searchQuery,
      page: 1,
    }));
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilters({
      search: '',
      location: '',
      department: '',
      job_type: '',
      experience: '',
      company: '',
      posted_within: '',
      shift: '',
      sort_by: 'newest',
      page: 1,
      per_page: 12,
    });
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Active filters chips
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; value: string }[] = [];

    if (filters.search) {
      chips.push({ key: 'search', label: 'Search', value: filters.search });
    }
    if (filters.location) {
      filters.location.split(',').forEach((v) => {
        chips.push({ key: 'location', label: 'Location', value: v });
      });
    }
    if (filters.department) {
      filters.department.split(',').forEach((v) => {
        chips.push({ key: 'department', label: 'Department', value: v });
      });
    }
    if (filters.job_type) {
      filters.job_type.split(',').forEach((v) => {
        chips.push({ key: 'job_type', label: 'Job Type', value: v });
      });
    }
    if (filters.company) {
      filters.company.split(',').forEach((v) => {
        chips.push({ key: 'company', label: 'Company', value: v });
      });
    }
    if (filters.experience) {
      chips.push({ key: 'experience', label: 'Experience', value: filters.experience });
    }
    if (filters.posted_within) {
      const label = filterOptions?.posted_within_options.find(
        (o) => o.value === filters.posted_within
      )?.label;
      chips.push({ key: 'posted_within', label: 'Posted', value: label || filters.posted_within });
    }

    return chips;
  }, [filters, filterOptions]);

  const removeFilterChip = (key: string, value: string) => {
    setFilters((prev) => {
      const current = prev[key as keyof JobsFilters] as string || '';
      if (key === 'search' || key === 'experience' || key === 'posted_within') {
        return { ...prev, [key]: '', page: 1 };
      }
      const values = current.split(',').filter((v) => v !== value);
      return { ...prev, [key]: values.join(','), page: 1 };
    });
    if (key === 'search') {
      setSearchQuery('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/careers" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">Careers</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Search Section */}
      <section className="relative py-16 lg:py-24 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.05%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
            Find Your Next Opportunity
          </h1>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Discover {stats?.total_jobs || 'exciting'} open positions across{' '}
            {stats?.total_locations || 'multiple'} locations
          </p>

          {/* Search Box */}
          <div className="bg-white rounded-2xl shadow-2xl p-2 max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-2">
              <SearchAutocomplete
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleSearch}
                suggestions={suggestions}
                isLoading={isSuggestionsLoading}
              />
              <button
                onClick={handleSearch}
                className="h-14 px-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
              >
                <Search className="w-5 h-5" />
                <span>Search</span>
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {filterOptions?.departments.slice(0, 5).map((dept) => (
              <button
                key={dept}
                onClick={() => handleFilterChange('department', dept)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-full backdrop-blur-sm transition-colors"
              >
                {dept}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <StatsBar stats={stats} />
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filter Sidebar */}
          <FilterSidebar
            filters={filters}
            filterOptions={filterOptions}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
          />

          {/* Job Listings */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsFilterOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                  {activeFilterChips.length > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                      {activeFilterChips.length}
                    </span>
                  )}
                </button>

                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {pagination?.total_count || 0}
                  </span>{' '}
                  jobs found
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Sort Dropdown */}
                <select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  className="h-10 pl-3 pr-8 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {filterOptions?.sort_options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {/* View Toggle */}
                <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${
                      viewMode === 'grid'
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-white text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${
                      viewMode === 'list'
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-white text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {activeFilterChips.map((chip, idx) => (
                  <span
                    key={`${chip.key}-${chip.value}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-full"
                  >
                    <span className="text-indigo-500">{chip.label}:</span>
                    {chip.value}
                    <button
                      onClick={() => removeFilterChip(chip.key, chip.value)}
                      className="ml-1 p-0.5 hover:bg-indigo-100 rounded-full"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={handleClearFilters}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Job Cards */}
            {isLoading ? (
              <div className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse"
                  >
                    <div className="h-4 bg-slate-200 rounded w-1/4 mb-4" />
                    <div className="h-6 bg-slate-200 rounded w-3/4 mb-3" />
                    <div className="h-4 bg-slate-200 rounded w-1/2 mb-4" />
                    <div className="flex gap-2 mb-4">
                      <div className="h-6 bg-slate-200 rounded-full w-20" />
                      <div className="h-6 bg-slate-200 rounded-full w-24" />
                    </div>
                    <div className="h-4 bg-slate-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Something went wrong
                </h3>
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={() => setFilters({ ...filters })}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Try Again
                </button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  No jobs found
                </h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  We couldn't find any jobs matching your criteria. Try adjusting your
                  filters or search terms.
                </p>
                <button
                  onClick={handleClearFilters}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`grid gap-4 ${
                    viewMode === 'grid' ? 'md:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {jobs.map((job) => (
                    <JobCard key={job.request_id} job={job} viewMode={viewMode} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination && (
                  <Pagination pagination={pagination} onPageChange={handlePageChange} />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

