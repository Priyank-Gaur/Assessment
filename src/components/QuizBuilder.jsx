import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import PreviewIcon from '@mui/icons-material/Preview';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import './QuizBuilder.css';
import QuizAssignmentGraph from './QuizAssignmentGraph';
import RichTextEditor from './RichTextEditor';

const QuizBuilder = ({ profiles, packets, savedQuizzes, addQuiz, updateQuiz, deleteQuiz, addPacketsToQuiz, removePacketsFromQuiz, assignQuiz, assignQuizToProfiles, removeQuizAssignment, quizAssignments, onDataChange, getQuizPackets }) => {
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [quizPackets, setQuizPackets] = useState([]);
  const [quizName, setQuizName] = useState('');
  const [reportHeader, setReportHeader] = useState('');
  const [reportFooter, setReportFooter] = useState('');
  const [startInstructions, setStartInstructions] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const formRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [packetSearchQuery, setPacketSearchQuery] = useState('');

  const filteredQuizzes = useMemo(() => {
    if (!searchQuery.trim()) return savedQuizzes;
    const query = searchQuery.toLowerCase().trim();
    return (savedQuizzes || []).filter(q => 
      q.name && q.name.toLowerCase().includes(query)
    );
  }, [savedQuizzes, searchQuery]);

  const filteredAvailablePackets = useMemo(() => {
    if (!packetSearchQuery.trim()) return packets;
    const query = packetSearchQuery.toLowerCase().trim();
    return (packets || []).filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.description && p.description.toLowerCase().includes(query))
    );
  }, [packets, packetSearchQuery]);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    
    // Handle quiz packet reordering only
    if (result.source.droppableId === 'quiz-packets' && result.destination.droppableId === 'quiz-packets') {
      const items = Array.from(quizPackets);
      const [reordered] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reordered);
      setQuizPackets(items);
    }
  };

  const addPacketToQuiz = (packet) => {
    if (!quizPackets.find((p) => p.id === packet.id)) {
      setQuizPackets([...quizPackets, packet]);
    }
  };

  const saveQuiz = async () => {
    if (!quizName || quizPackets.length === 0) {
      alert('Quiz name and at least one packet required!');
      return;
    }
    
    try {
      if (isEditing && editingQuiz) {
        // Update existing quiz
        await updateQuiz(editingQuiz.id, {
          name: quizName,
          description: '',
          time_limit: null,
          passing_score: 70,
          report_header: reportHeader,
          report_footer: reportFooter,
          start_instructions: startInstructions
        });

        // Get current packets for this quiz to remove them
        const currentPackets = await getQuizPackets(editingQuiz.id);
        const currentPacketIds = currentPackets.map(p => p.id);
        
        // Remove all current packets and add the new ones
        if (currentPacketIds.length > 0) {
          await removePacketsFromQuiz(editingQuiz.id, currentPacketIds);
        }
        
        if (quizPackets.length > 0) {
          await addPacketsToQuiz(editingQuiz.id, quizPackets.map(p => p.id));
        }

        alert('Quiz updated successfully!');
      } else {
        // Create new quiz
        const newQuiz = await addQuiz({
          name: quizName,
          description: '',
          time_limit: null,
          passing_score: 70,
          report_header: reportHeader,
          report_footer: reportFooter,
          start_instructions: startInstructions
        });

        // Add packets to the quiz
        if (quizPackets.length > 0) {
          await addPacketsToQuiz(newQuiz.id, quizPackets.map(p => p.id));
        }

        // Assign quiz to the selected profiles
        if (selectedProfiles.length > 0) {
          if (assignQuizToProfiles) {
            await assignQuizToProfiles(newQuiz.id, selectedProfiles);
          } else {
            for (const profileId of selectedProfiles) {
              await assignQuiz(profileId, newQuiz.id);
            }
          }
        }
        alert('Quiz saved successfully!');
      }

      // Refresh data to show updated packet information
      if (onDataChange) {
        await onDataChange();
      }

      // Reset form
      setQuizName('');
      setReportHeader('');
      setReportFooter('');
      setStartInstructions('');
      setQuizPackets([]);
      setSelectedProfiles([]);
      setEditingQuiz(null);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving quiz:', error);
      alert('Failed to save quiz. Please try again.');
    }
  };

  const editQuiz = async (quiz) => {
    try {
      setEditingQuiz(quiz);
      setQuizName(quiz.name);
      setReportHeader(quiz.report_header || '');
      setReportFooter(quiz.report_footer || '');
      setStartInstructions(quiz.start_instructions || '');
      setSelectedProfiles([]);
      
      // Load existing packets for this quiz
      const existingPackets = await getQuizPackets(quiz.id);
      setQuizPackets(existingPackets || []);
      
      setIsEditing(true);

      // Auto scroll to form
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Error loading quiz for editing:', error);
      alert('Failed to load quiz for editing. Please try again.');
    }
  };

  const cancelEdit = () => {
    setQuizName('');
    setReportHeader('');
    setReportFooter('');
    setStartInstructions('');
    setQuizPackets([]);
    setSelectedProfiles([]);
    setEditingQuiz(null);
    setIsEditing(false);
  };

  // Gather all questions from quizPackets
  const allQuestions = quizPackets.flatMap((packet) =>
    packet.questions?.map((q, idx) => ({
      ...q,
      packetName: packet.name,
      idx,
    })) || []
  );

  return (
    <div className="quiz-builder">
      <div className="quiz-builder__grid">
        {/* Left Column - Form */}
        <div className="quiz-card quiz-card--form" ref={formRef}>
          <h3 className="quiz-card__title">
            {isEditing ? 'Edit Quiz' : 'Build Quiz'}
          </h3>
          <div className="form-group">
            <label className="form-label">Quiz Name</label>
            <input
              type="text"
              className="form-input"
              value={quizName}
              onChange={e => setQuizName(e.target.value)}
              placeholder="Enter quiz name..."
            />
          </div>
          
          <RichTextEditor
            label="Report Header"
            value={reportHeader}
            onChange={setReportHeader}
            placeholder="Enter header text that will appear before Performance Overview in the report..."
            height={150}
          />
          <RichTextEditor
            label="Report Footer"
            value={reportFooter}
            onChange={setReportFooter}
            placeholder="Enter footer text that will appear after Achievement Summary in the report..."
            height={150}
          />
          
          <RichTextEditor
            label="Start Instructions"
            value={startInstructions}
            onChange={setStartInstructions}
            placeholder="Enter instructions shown before quiz starts (supports markdown)..."
            height={150}
          />

          {!isEditing && (
            <div className="form-group">
              <label className="form-label">Select Profiles to Assign Quiz</label>
              <div 
                className="form-input" 
                style={{ 
                  height: 'auto', 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  padding: '10px',
                  backgroundColor: 'var(--color-bg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
                }}
              >
                {profiles.map((profile) => {
                  const isChecked = selectedProfiles.includes(profile.id);
                  return (
                    <label 
                      key={profile.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        cursor: 'pointer',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-fg)',
                        fontWeight: 500
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProfiles([...selectedProfiles, profile.id]);
                          } else {
                            setSelectedProfiles(selectedProfiles.filter(id => id !== profile.id));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{profile.name}{profile.type ? ` (${profile.type})` : ''}</span>
                    </label>
                  );
                })}
                {profiles.length === 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)' }}>
                    No profiles available. Create a profile first.
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn--primary btn--full"
            onClick={saveQuiz}
            disabled={!quizName || quizPackets.length === 0}
            style={{ marginBottom: 'var(--space-3)' }}
          >
            <SaveIcon className="btn-icon" />
            {isEditing ? 'Update Quiz' : 'Save Quiz'}
          </button>
          
          {isEditing && (
            <button
              type="button"
              className="btn btn--outline btn--full"
              onClick={cancelEdit}
              style={{ marginBottom: 'var(--space-3)' }}
            >
              Cancel Edit
            </button>
          )}

          <button
            type="button"
            className="btn btn--outline btn--full"
            onClick={() => setShowPreview(!showPreview)}
            disabled={quizPackets.length === 0}
          >
            <PreviewIcon className="btn-icon" />
            {showPreview ? 'Hide Preview' : 'Preview Quiz'}
          </button>
        </div>

        {/* Center Column - Quiz Packets (Drag and Drop) */}
        <div className="quiz-card">
          <h3 className="quiz-card__title">Quiz Packets (Drag to Reorder)</h3>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="quiz-packets">
              {(provided, snapshot) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef} 
                  className={`droppable-area ${snapshot.isDraggingOver ? 'droppable-area--active' : ''}`}
                >
                  {quizPackets.map((packet, index) => (
                    <Draggable key={packet.id} draggableId={packet.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="draggable-packet"
                        >
                          <div>
                            <div className="draggable-packet__name">{packet.name}</div>
                            <div className="draggable-packet__questions">
                              {packet.questions?.length || 0} questions
                            </div>
                          </div>
                          <button
                            type="button"
                            className="icon-btn icon-btn--danger"
                            onClick={() => setQuizPackets(quizPackets.filter(p => p.id !== packet.id))}
                            title="Remove Packet"
                          >
                            <AddCircleOutlineIcon style={{ transform: 'rotate(45deg)', width: '18px', height: '18px' }} />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* Right Column - Available Packets */}
        <div className="quiz-card">
          <h3 className="quiz-card__title">Available Packets</h3>
          <div className="search-bar-container" style={{ marginBottom: 'var(--space-3)' }}>
            <input
              type="text"
              className="form-input search-input"
              value={packetSearchQuery}
              onChange={e => setPacketSearchQuery(e.target.value)}
              placeholder="Search packets..."
              style={{
                paddingLeft: '36px',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23895BF5\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '10px center',
                backgroundSize: '18px 18px'
              }}
            />
          </div>
          <div className="available-packets-list">
            {filteredAvailablePackets.length === 0 ? (
              <p className="form-helper" style={{ textAlign: 'center', margin: 'var(--space-4) 0' }}>
                {packetSearchQuery ? "No packets match your search." : "No available packets."}
              </p>
            ) : (
              filteredAvailablePackets.map((packet) => {
                const isDisabled = !!quizPackets.find((p) => p.id === packet.id);
                return (
                  <div
                    key={packet.id}
                    className={`available-packet-item ${isDisabled ? 'available-packet-item--disabled' : ''}`}
                    onClick={() => !isDisabled && addPacketToQuiz(packet)}
                  >
                    <div>
                      <div className="available-packet-item__name">{packet.name}</div>
                      <div className="available-packet-item__questions">
                        {packet.questions?.length || 0} questions
                      </div>
                    </div>
                    <AddCircleOutlineIcon style={{ color: isDisabled ? 'var(--color-muted)' : 'var(--color-primary)', width: '20px', height: '20px' }} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quiz Preview */}
      {showPreview && (
        <div className="section-card quiz-preview-card">
          <h3 className="section-card__title">Quiz Preview</h3>
          {allQuestions.length === 0 ? (
            <p className="form-helper">No questions to preview. Add packets first.</p>
          ) : (
            <div className="preview-question-list">
              {allQuestions.map((question, index) => (
                <div key={index} className="preview-question-item">
                  <div className="preview-question-item__header">
                    {index + 1}. {question.question_text}
                  </div>
                  <div className="preview-question-item__meta">
                    Type: {(question.question_type === 'mcq' || question.type === 'mcq') ? 'Multiple Choice' : 'True/False'} | Packet: {question.packetName}
                  </div>
                  {(question.question_type === 'mcq' || question.type === 'mcq') && question.options && (
                    <div className="preview-question-item__options">
                      {question.options.map((option, optIndex) => (
                        <div key={optIndex} className="preview-question-item__option">
                          {String.fromCharCode(65 + optIndex)}. {typeof option === 'object' ? option.text : option}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="preview-question-item__correct">
                    Correct Answer: {question.correct_answer || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved Quizzes */}
      <div className="section-card saved-quizzes-card">
        <h3 className="section-card__title">Saved Quizzes</h3>

        {/* Search Bar */}
        <div className="search-bar-container" style={{ marginBottom: 'var(--space-4)' }}>
          <input
            type="text"
            className="form-input search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search quizzes..."
            style={{
              paddingLeft: '36px',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23895BF5\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '10px center',
              backgroundSize: '18px 18px'
            }}
          />
        </div>

        {filteredQuizzes.length === 0 ? (
          <p className="form-helper">
            {searchQuery ? "No quizzes match your search query." : "No quizzes saved yet. Create your first quiz above!"}
          </p>
        ) : (
          <div className="saved-quizzes-list">
            {filteredQuizzes.map((quiz) => (
              <div key={quiz.id} className="saved-quiz-item">
                <div>
                  <div className="saved-quiz-item__name">{quiz.name}</div>
                  <div className="saved-quiz-item__date">
                    Created: {new Date(quiz.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="saved-quiz-item__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => editQuiz(quiz)}
                    title="Edit Quiz"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={() => { if (window.confirm("Are you sure you want to delete this quiz?")) deleteQuiz(quiz.id); }}
                    title="Delete Quiz"
                  >
                    <AddCircleOutlineIcon style={{ transform: 'rotate(45deg)', width: '18px', height: '18px' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quiz Assignment Graph Section */}
      <QuizAssignmentGraph
        profiles={profiles}
        savedQuizzes={savedQuizzes}
        quizAssignments={quizAssignments}
        onAssignQuiz={assignQuiz}
        onRemoveAssignment={removeQuizAssignment}
        onDataChange={onDataChange}
      />
    </div>
  );
};

export default QuizBuilder; 