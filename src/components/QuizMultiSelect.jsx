import React, { useState, useRef, useEffect } from 'react'
import {
  Quiz as QuizIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  KeyboardArrowDown as ArrowDownIcon
} from '@mui/icons-material'

const QuizMultiSelect = ({
  quizzes = [],
  selected = [],
  onChange,
  placeholder = 'All Quizzes',
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // Auto-focus search input when opened
      if (searchInputRef.current) {
        searchInputRef.current.focus()
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const filteredQuizzes = quizzes.filter(q =>
    q.toLowerCase().includes(searchTerm.trim().toLowerCase())
  )

  const toggleQuiz = (quizName) => {
    if (selected.includes(quizName)) {
      onChange(selected.filter(name => name !== quizName))
    } else {
      onChange([...selected, quizName])
    }
  }

  const selectAll = () => {
    if (searchTerm.trim()) {
      // If searching, add all filtered quizzes to existing selection
      const union = Array.from(new Set([...selected, ...filteredQuizzes]))
      onChange(union)
    } else {
      onChange([...quizzes])
    }
  }

  const clearAll = (e) => {
    if (e) e.stopPropagation()
    onChange([])
  }

  const getLabel = () => {
    if (selected.length === 0) {
      return `${placeholder} (${quizzes.length})`
    }
    if (selected.length === 1) {
      return selected[0]
    }
    return `${selected.length} Quizzes Selected`
  }

  return (
    <div className="quiz-multiselect" ref={dropdownRef} style={style}>
      <button
        type="button"
        className={`quiz-multiselect__trigger ${selected.length > 0 ? 'quiz-multiselect__trigger--active' : ''} ${isOpen ? 'quiz-multiselect__trigger--open' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        title={selected.length > 0 ? `Selected: ${selected.join(', ')}` : placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <QuizIcon className="quiz-multiselect__icon" style={{ fontSize: '1.15rem' }} />
        <span className="quiz-multiselect__label" title={getLabel()}>
          {getLabel()}
        </span>
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            className="quiz-multiselect__clear-btn"
            onClick={clearAll}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                clearAll()
              }
            }}
            title="Clear quiz filter"
          >
            <CloseIcon style={{ fontSize: '14px' }} />
          </span>
        )}
        <ArrowDownIcon
          className={`quiz-multiselect__arrow ${isOpen ? 'quiz-multiselect__arrow--rotated' : ''}`}
          style={{ fontSize: '1.2rem' }}
        />
      </button>

      {isOpen && (
        <div className="quiz-multiselect__menu" role="listbox">
          <div className="quiz-multiselect__header">
            <div className="quiz-multiselect__search-box">
              <SearchIcon style={{ fontSize: '1.1rem', color: 'var(--color-muted-fg, #6b7280)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search quizzes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="quiz-multiselect__search-clear"
                  onClick={() => setSearchTerm('')}
                >
                  <CloseIcon style={{ fontSize: '12px' }} />
                </button>
              )}
            </div>

            <div className="quiz-multiselect__actions">
              <button
                type="button"
                className="quiz-multiselect__action-btn"
                onClick={selectAll}
                disabled={filteredQuizzes.length === 0}
              >
                Select All
              </button>
              <button
                type="button"
                className="quiz-multiselect__action-btn"
                onClick={() => clearAll()}
                disabled={selected.length === 0}
              >
                Clear
              </button>
              <span className="quiz-multiselect__count">
                {selected.length}/{quizzes.length}
              </span>
            </div>
          </div>

          <div className="quiz-multiselect__list">
            {filteredQuizzes.length === 0 ? (
              <div className="quiz-multiselect__empty">
                {searchTerm ? 'No quizzes match search' : 'No quizzes available'}
              </div>
            ) : (
              filteredQuizzes.map((quizName) => {
                const isSelected = selected.includes(quizName)
                return (
                  <label
                    key={quizName}
                    className={`quiz-multiselect__item ${isSelected ? 'quiz-multiselect__item--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleQuiz(quizName)}
                    />
                    <span className="quiz-multiselect__item-name" title={quizName}>
                      {quizName}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default QuizMultiSelect
