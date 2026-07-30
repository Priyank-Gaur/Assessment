import React, { useState, useCallback, useMemo } from 'react';
import ViewListIcon from '@mui/icons-material/ViewList';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import 'reactflow/dist/style.css';

// Lazy load React Flow to prevent white screen issues
const ReactFlowComponent = React.lazy(() => import('reactflow').then(module => ({
  default: module.default
})));

// Import React Flow components directly
import { Controls, Background, MiniMap, useNodesState, useEdgesState, ReactFlowProvider } from 'reactflow';

const QuizAssignmentGraph = ({ 
  profiles, 
  savedQuizzes, 
  quizAssignments, 
  onAssignQuiz, 
  onRemoveAssignment,
  onDataChange 
}) => {
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'graph'
  const [reactFlowError, setReactFlowError] = useState(false);

  // Debug logging
  console.log('QuizAssignmentGraph props:', {
    profiles: profiles?.length,
    savedQuizzes: savedQuizzes?.length,
    quizAssignments: quizAssignments?.length
  });

  // Check if we have data to display
  if (!profiles || !savedQuizzes || profiles.length === 0 || savedQuizzes.length === 0) {
    return (
      <div className="section-card" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 'var(--space-6)' }}>
        <h3 className="section-card__title" style={{ color: 'var(--color-muted-fg)', textAlign: 'center', margin: 0 }}>
          No quizzes or profiles available for assignment
        </h3>
      </div>
    );
  }

  const handleViewModeChange = (event, newMode) => {
    if (newMode !== null) {
      setViewMode(newMode);
      if (newMode === 'graph') {
        setReactFlowError(false);
      }
    }
  };

  const GraphView = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Create nodes for quizzes and profiles
    const createNodes = useMemo(() => {
      try {
        const quizNodes = (savedQuizzes || []).map((quiz, index) => ({
          id: `quiz-${quiz.id}`,
          type: 'default',
          position: { x: 50, y: 100 + index * 120 },
          data: { 
            label: quiz.name,
            quiz: quiz,
            type: 'quiz'
          },
          style: {
            background: '#E9F0FC',
            border: '2px solid #4B7BD4',
            borderRadius: '8px',
            padding: '10px',
            minWidth: '150px',
            textAlign: 'center',
            color: '#000',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        }));

        const validProfiles = (profiles || []).filter(p => p.name && p.name.toUpperCase() !== 'SOLV' && p.name.toUpperCase() !== 'INDIVIDUAL');
        const profileNodes = validProfiles.map((profile, index) => ({
          id: `profile-${profile.id}`,
          type: 'default',
          position: { x: 400, y: 100 + index * 120 },
          data: { 
            label: `${profile.name}${profile.type ? ` (${profile.type})` : ''}`,
            profile: profile,
            type: 'profile'
          },
          style: {
            background: '#f3e5f5',
            border: '2px solid #9c27b0',
            borderRadius: '8px',
            padding: '10px',
            minWidth: '150px',
            textAlign: 'center',
            color: '#000',
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        }));

        return [...quizNodes, ...profileNodes];
      } catch (error) {
        console.error('Error creating nodes:', error);
        return [];
      }
    }, [savedQuizzes, profiles]);

    // Helper to generate a random color
    function getRandomColor(id) {
      // Use a hash of the edge id for consistent color per edge
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
      }
      const color = `hsl(${hash % 360}, 70%, 50%)`;
      return color;
    }

    // Create edges for existing assignments
    const createEdges = useMemo(() => {
      try {
        return (quizAssignments || []).map((assignment) => {
          const edgeId = `edge-${assignment.quiz_id}-${assignment.profile_id}`;
          return {
            id: edgeId,
            source: `quiz-${assignment.quiz_id}`,
            target: `profile-${assignment.profile_id}`,
            type: 'bezier',
            style: { stroke: getRandomColor(edgeId), strokeWidth: 3 },
            data: { assignment: { quiz_id: assignment.quiz_id, profile_id: assignment.profile_id } },
            animated: true,
          };
        });
      } catch (error) {
        console.error('Error creating edges:', error);
        return [];
      }
    }, [quizAssignments]);

    // Initialize nodes and edges
    React.useEffect(() => {
      try {
        console.log('Setting nodes:', createNodes);
        console.log('Setting edges:', createEdges);
        setNodes(createNodes);
        setEdges(createEdges);
      } catch (error) {
        console.error('Error initializing nodes and edges:', error);
        setReactFlowError(true);
      }
    }, [createNodes, createEdges, setNodes, setEdges]);

    // Handle new connections
    const onConnect = useCallback(async (params) => {
      try {
        const sourceId = params.source;
        const targetId = params.target;
        
        // Extract quiz and profile IDs
        const quizId = sourceId.replace('quiz-', '');
        const profileId = targetId.replace('profile-', '');
        
        // Check if connection already exists
        const existingEdge = edges.find(
          edge => edge.source === sourceId && edge.target === targetId
        );
        
        if (existingEdge) {
          alert('This quiz is already assigned to this profile!');
          return;
        }
        
        // Add the assignment
        await onAssignQuiz(profileId, quizId);
        
        // Add the new edge
        const newEdge = {
          id: `edge-${quizId}-${profileId}`,
          source: sourceId,
          target: targetId,
          type: 'bezier',
          style: { stroke: '#2E9E7E', strokeWidth: 3 },
          data: { assignment: { quiz_id: quizId, profile_id: profileId } },
          animated: true,
        };
        
        setEdges((eds) => [...eds, newEdge]);
        
        // Refresh data
        if (onDataChange) {
          await onDataChange();
        }
      } catch (error) {
        console.error('Error assigning quiz:', error);
        alert('Failed to assign quiz. Please try again.');
      }
    }, [edges, onAssignQuiz, onDataChange, setEdges]);

    // Handle edge removal
    const onEdgeClick = useCallback(async (event, edge) => {
      try {
        console.log('Edge clicked:', edge);
        console.log('Edge data:', edge.data);
        
        const confirmed = window.confirm('Remove this quiz assignment?');
        if (confirmed) {
          const { quiz_id, profile_id } = edge.data.assignment;
          console.log('Removing assignment:', { quiz_id, profile_id });
          
          await onRemoveAssignment(profile_id, quiz_id);
          
          // Remove the edge
          setEdges((eds) => eds.filter((e) => e.id !== edge.id));
          
          // Refresh data
          if (onDataChange) {
            await onDataChange();
          }
        }
      } catch (error) {
        console.error('Error removing assignment:', error);
        alert('Failed to remove assignment. Please try again.');
      }
    }, [onRemoveAssignment, onDataChange, setEdges]);

    if (reactFlowError) {
      return (
        <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="alert alert--error">
            Graph view is temporarily unavailable. Please use the list view.
          </div>
        </div>
      );
    }

    return (
      <React.Suspense fallback={
        <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading graph view...</p>
        </div>
      }>
        <div className="graph-view-container">
          <style>
            {`
              .react-flow {
                height: 100% !important;
              }
              .react-flow__node {
                cursor: grab;
                user-select: none;
              }
              .react-flow__node:active {
                cursor: grabbing;
              }
              .react-flow__handle {
                background: #2E9E7E;
                border: 2px solid #fff;
                width: 12px;
                height: 12px;
                opacity: 0.8;
              }
              .react-flow__handle:hover {
                background: #268A6D;
                opacity: 1;
              }
              .react-flow__handle.connecting {
                background: #C4841D;
              }
              .react-flow__connection-path {
                stroke: #2E9E7E;
                stroke-width: 3;
              }
              .react-flow__connection-line {
                stroke: #2E9E7E;
                stroke-width: 2;
              }
              .react-flow__pane {
                cursor: grab;
              }
              .react-flow__pane:active {
                cursor: grabbing;
              }
            `}
          </style>
          <ReactFlowProvider>
            <ReactFlowComponent
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              fitView
              style={{ background: '#1a1a1a' }}
              connectionMode="loose"
              snapToGrid={true}
              snapGrid={[15, 15]}
              panOnDrag={true}
              panOnScroll={false}
              zoomOnScroll={true}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
              selectNodesOnDrag={false}
              defaultEdgeOptions={{
                type: 'bezier',
                style: { stroke: '#2E9E7E', strokeWidth: 3 },
                animated: true,
              }}
            >
              <Background color="#333" gap={20} />
              <Controls style={{ background: '#2a2a2a', border: '1px solid #444' }} />
            </ReactFlowComponent>
          </ReactFlowProvider>
        </div>
      </React.Suspense>
    );
  };

  const ListView = () => (
    <div className="list-view-container">
      <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        Available Quizzes ({savedQuizzes.length}):
      </h4>
      <div style={{ marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {savedQuizzes.map((quiz) => (
          <div key={quiz.id} style={{ 
            padding: 'var(--space-3) var(--space-4)', 
            backgroundColor: 'var(--color-tertiary)', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid rgba(142, 102, 241, 0.2)' 
          }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {quiz.name}
            </span>
          </div>
        ))}
      </div>

      {(() => {
        const filteredProfilesList = (profiles || []).filter(p => p.name && p.name.toUpperCase() !== 'SOLV' && p.name.toUpperCase() !== 'INDIVIDUAL');
        return (
          <>
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              Profiles ({filteredProfilesList.length}):
            </h4>
            <div style={{ marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {filteredProfilesList.map((profile) => {
                const count = (quizAssignments || []).filter(aq => aq.profile_id === profile.id && !aq.user_id).length;
                return (
                  <div key={profile.id} style={{ 
                    padding: 'var(--space-3) var(--space-4)', 
                    backgroundColor: 'rgba(166, 85, 247, 0.05)', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid rgba(166, 85, 247, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {profile.name}{profile.type ? ` (${profile.type})` : ''}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-fg)', backgroundColor: 'var(--color-tertiary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                      {count} {count === 1 ? 'assessment' : 'assessments'} mapped
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        Current Assignments ({quizAssignments?.length || 0}):
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {quizAssignments?.map((assignment) => {
          const quiz = savedQuizzes.find(q => q.id === assignment.quiz_id);
          const profile = profiles.find(p => p.id === assignment.profile_id);
          return (
            <div key={assignment.id} style={{ 
              padding: 'var(--space-3) var(--space-4)', 
              backgroundColor: 'rgba(16, 185, 129, 0.05)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>
                <strong>{quiz?.name || 'Unknown Quiz'}</strong> &rarr; <strong>{profile?.name || 'Unknown Profile'}</strong>
              </span>
              <button
                className="btn btn--outline btn--sm"
                style={{ color: 'var(--color-destructive)', borderColor: 'var(--color-destructive)', padding: '4px 12px' }}
                onClick={() => { if (window.confirm("Are you sure you want to remove this quiz assignment?")) onRemoveAssignment(assignment.profile_id, assignment.quiz_id); }}
              >
                Remove
              </button>
            </div>
          );
        })}
        {(!quizAssignments || quizAssignments.length === 0) && (
          <p className="form-helper" style={{ margin: 0 }}>No assignments yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="section-card" style={{ marginTop: 'var(--space-6)', minHeight: '700px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h3 className="section-card__title" style={{ margin: 0 }}>
          Quiz Assignment Manager
        </h3>
        <div className="btn-group-toggle">
          <button 
            type="button"
            className={`btn-toggle ${viewMode === 'list' ? 'btn-toggle--active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <ViewListIcon style={{ width: '18px', height: '18px' }} />
            List View
          </button>
          <button 
            type="button"
            className={`btn-toggle ${viewMode === 'graph' ? 'btn-toggle--active' : ''}`}
            onClick={() => setViewMode('graph')}
          >
            <AccountTreeIcon style={{ width: '18px', height: '18px' }} />
            Graph View
          </button>
        </div>
      </div>
      
      <div className="alert alert--info" style={{ marginBottom: 'var(--space-4)' }}>
        <strong>List View:</strong> Simple overview of quizzes, profiles, and assignments.
        <br />
        <strong>Graph View:</strong> Drag from quiz (blue) to profile (purple) to assign. Click connections to remove.
      </div>

      {viewMode === 'list' ? <ListView /> : <GraphView />}
    </div>
  );
};

export default QuizAssignmentGraph; 