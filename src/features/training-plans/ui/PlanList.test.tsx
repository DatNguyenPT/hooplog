import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import '@/shared/i18n';
import type { PlanSummary } from '../domain/plan';
import { PlanList } from './PlanList';

const mockRepo: jest.Mocked<PlanRepository> = {
  listPlans: jest.fn(),
  getPlan: jest.fn(),
  getActivePlan: jest.fn(),
  createPlan: jest.fn(),
  renamePlan: jest.fn(),
  setActive: jest.fn(),
  deletePlan: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
};
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@/features/training-plans/data/planRepository', () => ({
  usePlanRepository: () => mockRepo,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const matchPrep: PlanSummary = { id: 'p1', name: 'Match prep', isActive: true, itemCount: 3 };
const skills: PlanSummary = { id: 'p2', name: 'Skills', isActive: false, itemCount: 1 };

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates,
  // and FlatList batches its rows on a timer that fires outside act() in the same way.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (message.includes('not configured to support act')) return;
    if (message.includes('update to VirtualizedList inside a test was not wrapped in act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.listPlans.mockResolvedValue([matchPrep, skills]);
  mockRepo.createPlan.mockResolvedValue('new-plan');
});

afterEach(() => jest.restoreAllMocks());

describe('PlanList screen', () => {
  it('shows a loading indicator, then the plans with their item counts', async () => {
    let resolve!: (value: PlanSummary[]) => void;
    mockRepo.listPlans.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<PlanList />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    await act(async () => resolve([matchPrep, skills]));
    expect(await screen.findByLabelText('Match prep, active, 3 items')).toBeTruthy();
    expect(screen.getByLabelText('Skills, 1 item')).toBeTruthy();
    expect(screen.getAllByText('Active')).toHaveLength(1);
  });

  it('shows the error state and retries', async () => {
    mockRepo.listPlans.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    await render(<PlanList />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('No plans yet')).toBeTruthy();
  });

  it('shows the empty state and still offers to create a plan', async () => {
    mockRepo.listPlans.mockResolvedValue([]);
    await render(<PlanList />);
    expect(await screen.findByText('No plans yet')).toBeTruthy();
    expect(screen.getByText('Create a plan to schedule your training week.')).toBeTruthy();
    expect(screen.getByLabelText('New plan')).toBeTruthy();
  });

  it('opens a plan and goes back', async () => {
    await render(<PlanList />);
    await fireEvent.press(await screen.findByLabelText('Skills, 1 item'));
    expect(mockPush).toHaveBeenCalledWith('/plans/p2');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('validates the name, then creates the plan and opens it', async () => {
    await render(<PlanList />);
    await fireEvent.press(await screen.findByLabelText('New plan'));

    await fireEvent.press(screen.getByLabelText('Create plan'));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Plan name'), ' match  PREP ');
    await fireEvent.press(screen.getByLabelText('Create plan'));
    expect(await screen.findByText('A plan with that name already exists.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'x'.repeat(41));
    await fireEvent.press(screen.getByLabelText('Create plan'));
    expect(await screen.findByText('That name is too long.')).toBeTruthy();
    expect(mockRepo.createPlan).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Plan name'), '  Summer   skills ');
    await fireEvent.press(screen.getByLabelText('Create plan'));
    await waitFor(() => expect(mockRepo.createPlan).toHaveBeenCalledWith('Summer skills'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/plans/new-plan'));
    expect(screen.queryByLabelText('Plan name')).toBeNull();
    expect(screen.getByLabelText('New plan')).toBeTruthy();
  });

  it('keeps the typed name and shows an inline error when creating fails', async () => {
    mockRepo.createPlan.mockRejectedValue(new Error('disk full'));
    await render(<PlanList />);
    await fireEvent.press(await screen.findByLabelText('New plan'));
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'Summer skills');
    await fireEvent.press(screen.getByLabelText('Create plan'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Plan name').props.value).toBe('Summer skills');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the plan is being created', async () => {
    let finish!: () => void;
    mockRepo.createPlan.mockReturnValue(new Promise((r) => (finish = () => r('new-plan'))));
    await render(<PlanList />);
    await fireEvent.press(await screen.findByLabelText('New plan'));
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'Summer skills');
    // Not awaited: the press resolves only when the save does.
    const firstPress = fireEvent.press(screen.getByLabelText('Create plan'));
    await waitFor(() => expect(mockRepo.createPlan).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Create plan')).toBeDisabled();
    finish();
    await firstPress;
    expect(mockRepo.createPlan).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/plans/new-plan');
  });

  it('closes the create form without saving when cancelled', async () => {
    await render(<PlanList />);
    await fireEvent.press(await screen.findByLabelText('New plan'));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByLabelText('Plan name')).toBeNull();
    expect(screen.getByLabelText('New plan')).toBeTruthy();
    expect(mockRepo.createPlan).not.toHaveBeenCalled();
  });
});
